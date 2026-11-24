import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  PaymentProvider,
  PlanAbonnement,
  Prisma,
  Role,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  ajouterJoursUTC,
  estAbonnementActif,
  lireParametresAbonnements,
  ParametresAbonnements,
} from '../common/parametres-abonnements';

export interface AbonnementResponse {
  id: string;
  userId: string;
  plan: PlanAbonnement;
  prixMensuel: number;
  dateDebut: Date;
  dateFin: Date | null;
  actif: boolean;
  /** Vrai uniquement pendant la période d'essai gratuite en cours. */
  enEssai: boolean;
}

@Injectable()
export class SubscriptionsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Grille tarifaire effective (configuration + surcharges), pour l'interface. */
  async getGrille(): Promise<ParametresAbonnements> {
    return lireParametresAbonnements(this.prisma);
  }

  /** Récupère l'abonnement de l'utilisateur connecté (sans créer de ligne pour un MEMBER). */
  async getAbonnement(userId: string): Promise<AbonnementResponse> {
    const abonnement = await this.prisma.subscription.findUnique({ where: { userId } });

    if (!abonnement) {
      return {
        id: 'gratuit',
        userId,
        plan: PlanAbonnement.GRATUIT,
        prixMensuel: 0,
        dateDebut: new Date(),
        dateFin: null,
        actif: true,
        enEssai: false,
      };
    }

    return this.formater(abonnement);
  }

  /**
   * Change le plan d'abonnement (Phase 6) :
   *  - premier passage à un plan payant : période d'essai gratuite, aucun
   *    paiement, fin à now + dureeEssaiJours ;
   *  - ensuite : paiement SIMULÉ (transaction ABONNEMENT réussie, montant
   *    entier FCFA) et fin à now + dureeAbonnementJours.
   * Les prix, limites et durées viennent de ParametresPlateforme (ou de
   * variables d'environnement), jamais du code ni du payload client.
   */
  async changerPlan(userId: string, plan: PlanAbonnement, role: Role): Promise<AbonnementResponse> {
    if (role === Role.MEMBER) {
      throw new ForbiddenException("Seuls les administrateurs de tontine peuvent souscrire à un abonnement.");
    }

    const parametres = await lireParametresAbonnements(this.prisma);
    const prixPlan = this.getPrixPlan(plan, parametres);
    const maintenant = new Date();
    const referenceExterne = `abon_sim_${randomUUID()}`;

    const abonnement = await this.prisma.$transaction(async (tx) => {
      // Sérialise les changements de plan d'un même utilisateur : sans ce
      // verrou, deux appels concurrents pourraient tous deux obtenir l'essai.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`abonnement_${userId}`}))`;
      const existant = await tx.subscription.findUnique({ where: { userId } });

      const enEssai = prixPlan > 0 && !existant?.aUtiliseEssai;
      const prixMensuel = enEssai ? 0 : prixPlan;
      const dateFin =
        prixPlan === 0
          ? null
          : ajouterJoursUTC(
              maintenant,
              enEssai ? parametres.dureeEssaiJours : parametres.dureeAbonnementJours,
            );

      if (prixMensuel > 0) {
        await this.enregistrerPaiementSimule(tx, userId, prixMensuel, referenceExterne);
      }

      return tx.subscription.upsert({
        where: { userId },
        update: {
          plan,
          prixMensuel,
          dateDebut: maintenant,
          dateFin,
          actif: true,
          aUtiliseEssai: Boolean(existant?.aUtiliseEssai) || enEssai,
          enEssai,
        },
        create: {
          userId,
          plan,
          prixMensuel,
          dateDebut: maintenant,
          dateFin,
          actif: true,
          aUtiliseEssai: enEssai,
          enEssai,
        },
      });
    });

    await this.audit.log('ABONNEMENT_CHANGÉ', abonnement.id, userId, {
      plan,
      prixMensuel: Number(abonnement.prixMensuel),
      enEssai: abonnement.enEssai,
      referenceExterne: abonnement.enEssai || prixPlan === 0 ? null : referenceExterne,
    });

    return this.formater(abonnement);
  }

  /** Renouvelle un abonnement payant expiré via un paiement simulé. */
  async renouveler(userId: string): Promise<AbonnementResponse> {
    const abonnement = await this.prisma.subscription.findUnique({ where: { userId } });
    if (!abonnement) throw new NotFoundException('Aucun abonnement trouvé.');
    if (abonnement.plan === PlanAbonnement.GRATUIT) {
      throw new BadRequestException('Le plan gratuit n’a pas besoin d’être renouvelé.');
    }

    const parametres = await lireParametresAbonnements(this.prisma);
    const prixMensuel = this.getPrixPlan(abonnement.plan, parametres);
    const referenceExterne = `abon_sim_${randomUUID()}`;

    const renouvele = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`abonnement_${userId}`}))`;
      const courant = await tx.subscription.findUnique({ where: { userId } });
      if (!courant) throw new NotFoundException('Aucun abonnement trouvé.');

      await this.enregistrerPaiementSimule(tx, userId, prixMensuel, referenceExterne);
      return tx.subscription.update({
        where: { userId },
        data: {
          actif: true,
          enEssai: false,
          aUtiliseEssai: true,
          prixMensuel,
          dateFin: ajouterJoursUTC(new Date(), parametres.dureeAbonnementJours),
        },
      });
    });

    await this.audit.log('ABONNEMENT_RENOUVELÉ', renouvele.id, userId, {
      plan: renouvele.plan,
      prixMensuel,
      referenceExterne,
    });

    return this.formater(renouvele);
  }

  /** Annule l'abonnement de l'utilisateur. */
  async annulerAbonnement(userId: string): Promise<AbonnementResponse> {
    const abonnement = await this.prisma.subscription.findUnique({ where: { userId } });
    if (!abonnement) throw new NotFoundException('Aucun abonnement trouvé.');

    const misAJour = await this.prisma.subscription.update({
      where: { userId },
      data: { actif: false, dateFin: new Date(), enEssai: false },
    });
    await this.audit.log('ABONNEMENT_ANNULÉ', misAJour.id, userId, { plan: misAJour.plan });
    return this.formater(misAJour);
  }

  /**
   * Vérifie si l'utilisateur peut créer une tontine selon son plan. Les limites
   * viennent de la configuration (GRATUIT / STANDARD, PREMIUM illimité). Une
   * dateFin passée invalide l'abonnement même si le booléen `actif` est vrai.
   */
  async peutCreerTontine(userId: string): Promise<boolean> {
    const abonnement = await this.prisma.subscription.findUnique({ where: { userId } });
    if (!abonnement || !estAbonnementActif(abonnement)) return false;

    const parametres = await lireParametresAbonnements(this.prisma);
    const nombreTontines = await this.prisma.tontine.count({ where: { createurId: userId } });

    switch (abonnement.plan) {
      case PlanAbonnement.GRATUIT:
        return nombreTontines < parametres.limiteTontinesGratuites;
      case PlanAbonnement.STANDARD:
        return nombreTontines < parametres.limiteTontinesStandard;
      case PlanAbonnement.PREMIUM:
        return true;
      default:
        return false;
    }
  }

  /**
   * Paiement SIMULÉ : même point de sortie que les paiements de cotisation,
   * mais aucun appel réseau. Montant entier FCFA, transaction auditée.
   */
  private async enregistrerPaiementSimule(
    tx: Prisma.TransactionClient,
    userId: string,
    montant: number,
    referenceExterne: string,
  ): Promise<void> {
    console.log(`[ABONNEMENT SIMULÉ] ${montant} FCFA pour ${userId} — ${referenceExterne}`);
    await tx.transaction.create({
      data: {
        type: TransactionType.ABONNEMENT,
        statut: TransactionStatus.REUSSIE,
        provider: PaymentProvider.VIREMENT,
        referenceExterne,
        montantBrut: montant,
        montantCommission: 0,
        montantNet: montant,
        userId,
      },
    });
  }

  private formater(abonnement: {
    id: string;
    userId: string;
    plan: PlanAbonnement;
    prixMensuel: unknown;
    dateDebut: Date;
    dateFin: Date | null;
    actif: boolean;
    enEssai: boolean;
  }): AbonnementResponse {
    const actif = estAbonnementActif(abonnement);
    return {
      id: abonnement.id,
      userId: abonnement.userId,
      plan: abonnement.plan,
      prixMensuel: Number(abonnement.prixMensuel),
      dateDebut: abonnement.dateDebut,
      dateFin: abonnement.dateFin,
      actif,
      enEssai: abonnement.enEssai && actif,
    };
  }

  /** Prix configuré du plan (entiers FCFA, GRATUIT = 0). */
  private getPrixPlan(plan: PlanAbonnement, parametres: ParametresAbonnements): number {
    switch (plan) {
      case PlanAbonnement.STANDARD:
        return parametres.prixStandardFcfa;
      case PlanAbonnement.PREMIUM:
        return parametres.prixPremiumFcfa;
      default:
        return 0;
    }
  }
}
