import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PaymentProvider, PlanAbonnement, Role, TransactionStatus, TransactionType } from '@prisma/client';

export interface AbonnementResponse {
  id: string;
  userId: string;
  plan: PlanAbonnement;
  prixMensuel: number;
  dateDebut: Date;
  dateFin: Date | null;
  actif: boolean;
}

@Injectable()
export class SubscriptionsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

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
      };
    }

    return this.formater(abonnement);
  }

  /**
   * Change le plan d'abonnement. Les plans payants génèrent une transaction
   * ABONNEMENT (simulée dans le MVP) avant l'activation effective du plan.
   */
  async changerPlan(userId: string, plan: PlanAbonnement, role: Role): Promise<AbonnementResponse> {
    if (role === Role.MEMBER) {
      throw new ForbiddenException("Seuls les administrateurs de tontine peuvent souscrire à un abonnement.");
    }

    const prixMensuel = this.getPrixPlan(plan);
    const referenceExterne = `abon_sim_${randomUUID()}`;

    const abonnement = await this.prisma.$transaction(async (tx) => {
      if (prixMensuel > 0) {
        // TODO: remplacer par un appel réel au provider une fois les clés configurées.
        console.log(`[ABONNEMENT SIMULÉ] ${plan} - ${prixMensuel} FCFA pour ${userId}`);
        await tx.transaction.create({
          data: {
            type: TransactionType.ABONNEMENT,
            statut: TransactionStatus.REUSSIE,
            provider: PaymentProvider.VIREMENT,
            referenceExterne,
            montantBrut: prixMensuel,
            montantCommission: 0,
            montantNet: prixMensuel,
            userId,
          },
        });
      }

      return tx.subscription.upsert({
        where: { userId },
        update: {
          plan,
          prixMensuel,
          dateDebut: new Date(),
          dateFin: null,
          actif: true,
        },
        create: {
          userId,
          plan,
          prixMensuel,
          actif: true,
        },
      });
    });

    await this.audit.log('ABONNEMENT_CHANGÉ', abonnement.id, userId, {
      plan,
      prixMensuel,
      referenceExterne,
    });

    return this.formater(abonnement);
  }

  /** Annule l'abonnement de l'utilisateur. */
  async annulerAbonnement(userId: string): Promise<AbonnementResponse> {
    const abonnement = await this.prisma.subscription.findUnique({ where: { userId } });
    if (!abonnement) throw new NotFoundException('Aucun abonnement trouvé.');

    const misAJour = await this.prisma.subscription.update({
      where: { userId },
      data: { actif: false, dateFin: new Date() },
    });
    await this.audit.log('ABONNEMENT_ANNULÉ', misAJour.id, userId, { plan: misAJour.plan });
    return this.formater(misAJour);
  }

  /**
   * Vérifie si l'utilisateur peut créer une tontine selon son plan :
   * 1 (GRATUIT), 5 (STANDARD), illimité (PREMIUM). Une dateFin passée
   * invalide l'abonnement même si le booléen `actif` n'a pas été mis à jour.
   */
  async peutCreerTontine(userId: string): Promise<boolean> {
    const abonnement = await this.prisma.subscription.findUnique({ where: { userId } });

    if (!abonnement || !abonnement.actif) return false;
    if (abonnement.dateFin && abonnement.dateFin.getTime() <= Date.now()) return false;

    const nombreTontines = await this.prisma.tontine.count({ where: { createurId: userId } });

    switch (abonnement.plan) {
      case PlanAbonnement.GRATUIT:
        return nombreTontines < 1;
      case PlanAbonnement.STANDARD:
        return nombreTontines < 5;
      case PlanAbonnement.PREMIUM:
        return true;
      default:
        return false;
    }
  }

  private formater(abonnement: {
    id: string;
    userId: string;
    plan: PlanAbonnement;
    prixMensuel: unknown;
    dateDebut: Date;
    dateFin: Date | null;
    actif: boolean;
  }): AbonnementResponse {
    return {
      id: abonnement.id,
      userId: abonnement.userId,
      plan: abonnement.plan,
      prixMensuel: Number(abonnement.prixMensuel),
      dateDebut: abonnement.dateDebut,
      dateFin: abonnement.dateFin,
      actif: abonnement.actif && !(abonnement.dateFin && abonnement.dateFin.getTime() <= Date.now()),
    };
  }

  private getPrixPlan(plan: PlanAbonnement): number {
    switch (plan) {
      case PlanAbonnement.STANDARD:
        return 5000;
      case PlanAbonnement.PREMIUM:
        return 15000;
      default:
        return 0;
    }
  }
}
