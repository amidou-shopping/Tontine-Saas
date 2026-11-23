import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTontineDto } from './dto/create-tontine.dto';
import { calculerCommissionCotisation } from '../common/monetization.util';
import {
  MemberStatus,
  PaymentProvider,
  Prisma,
  Role,
  Tontine,
  TontineStatus,
  TontineType,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { randomBytes } from 'crypto';

type TransactionClient = Prisma.TransactionClient;

interface EvenementCloture {
  beneficiaireUserId: string;
  montant: number;
  cycle: number;
  nomTontine: string;
}

@Injectable()
export class TontinesService {
  constructor(
    private prisma: PrismaService,
    private subscriptions: SubscriptionsService,
    private notifications: NotificationsService,
    private audit: AuditService,
  ) {}

  /** Liste les tontines en attente de membres (pour la découverte). */
  async lister() {
    return this.prisma.tontine.findMany({
      where: { statut: TontineStatus.EN_ATTENTE },
      include: {
        createur: { select: { nom: true, prenom: true } },
        _count: { select: { membres: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Liste les tontines créées par un ADMIN_TONTINE. */
  async mesTontinesAdmin(createurId: string) {
    return this.prisma.tontine.findMany({
      where: { createurId },
      include: {
        _count: { select: { membres: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Crée une tontine à l'état EN_ATTENTE (recrutement des membres). */
  async creer(createurId: string, dto: CreateTontineDto) {
    const createur = await this.prisma.user.findUnique({ where: { id: createurId } });
    if (!createur) throw new NotFoundException('Utilisateur introuvable.');

    // Le Super-Admin de la plateforme n'est pas soumis aux limits d'abonnement.
    if (createur.role !== Role.SUPER_ADMIN) {
      const peutCreer = await this.subscriptions.peutCreerTontine(createurId);
      if (!peutCreer) {
        throw new ForbiddenException(
          'Limite d\'abonnement atteinte : changez de plan pour créer une nouvelle tontine.',
        );
      }
    }

    const codeInvitation = randomBytes(4).toString('hex').toUpperCase(); // 8 caractères hex
    const tontine = await this.prisma.tontine.create({
      data: {
        nom: dto.nom,
        description: dto.description,
        type: dto.type ?? TontineType.CLASSIQUE,
        montantCotisation: dto.montantCotisation,
        frequence: dto.frequence,
        nombreMaxMembres: dto.nombreMaxMembres,
        tauxCommission: dto.tauxCommission ?? 0.015,
        createurId,
        codeInvitation,
      },
    });

    await this.audit.log('TONTINE_CREEE', tontine.id, createurId, {
      nom: tontine.nom,
      codeInvitation,
    });
    return tontine;
  }

  /** Rejoint une tontine via son code d'invitation. */
  async rejoindreParCode(codeInvitation: string, userId: string) {
    const tontine = await this.prisma.tontine.findUnique({
      where: { codeInvitation: codeInvitation.trim().toUpperCase() },
      include: { membres: true },
    });
    if (!tontine) throw new NotFoundException('Code d\'invitation invalide.');
    if (tontine.statut !== TontineStatus.EN_ATTENTE) {
      throw new BadRequestException('Cette tontine a déjà démarré ou est terminée.');
    }
    if (tontine.membres.length >= tontine.nombreMaxMembres) {
      throw new BadRequestException('Cette tontine est complète.');
    }
    if (tontine.membres.some((m) => m.userId === userId)) {
      throw new ConflictException('Vous êtes déjà membre de cette tontine.');
    }

    const prochainOrdre = tontine.membres.length + 1;
    await this.prisma.tontineMember.create({
      data: { tontineId: tontine.id, userId, ordrePassage: prochainOrdre },
    });

    return { message: 'Vous avez rejoint la tontine !', tontineId: tontine.id };
  }

  /**
   * Fait rejoindre une tontine EN_ATTENTE. L'ordre de passage est attribué
   * automatiquement (prochain rang libre), ce qui détermine le cycle de réception.
   */
  async rejoindre(tontineId: string, userId: string) {
    const tontine = await this.prisma.tontine.findUnique({
      where: { id: tontineId },
      include: { membres: true },
    });
    if (!tontine) throw new NotFoundException('Tontine introuvable.');
    if (tontine.statut !== TontineStatus.EN_ATTENTE) {
      throw new BadRequestException('Cette tontine a déjà démarré ou est terminée, impossible de la rejoindre.');
    }
    if (tontine.membres.length >= tontine.nombreMaxMembres) {
      throw new BadRequestException('Cette tontine est complète.');
    }
    if (tontine.membres.some((m) => m.userId === userId)) {
      throw new ConflictException('Vous êtes déjà membre de cette tontine.');
    }

    return this.prisma.tontineMember.create({
      data: { tontineId, userId, ordrePassage: tontine.membres.length + 1 },
    });
  }

  /** Ajoute un membre à une tontine (réservé à son administrateur). */
  async ajouterMembre(tontineId: string, userId: string, adminId: string, estSuperAdmin = false) {
    const tontine = await this.prisma.tontine.findUnique({
      where: { id: tontineId },
      include: { membres: true },
    });
    if (!tontine) throw new NotFoundException('Tontine introuvable.');
    await this.verifierPropriete(tontine, adminId, estSuperAdmin);

    if (tontine.statut !== TontineStatus.EN_ATTENTE) {
      throw new BadRequestException('Cette tontine a déjà démarré ou est terminée.');
    }
    if (tontine.membres.length >= tontine.nombreMaxMembres) {
      throw new BadRequestException('Cette tontine est complète.');
    }
    if (tontine.membres.some((m) => m.userId === userId)) {
      throw new ConflictException('Ce membre est déjà dans la tontine.');
    }

    await this.prisma.tontineMember.create({
      data: { tontineId, userId, ordrePassage: tontine.membres.length + 1 },
    });
    return { message: 'Membre ajouté avec succès.' };
  }

  /** Recherche des utilisateurs à ajouter à une tontine (exclut les membres déjà inscrits). */
  async rechercherMembres(tontineId: string, q: string, adminId: string, estSuperAdmin = false) {
    const tontine = await this.prisma.tontine.findUnique({
      where: { id: tontineId },
      include: { membres: true },
    });
    if (!tontine) throw new NotFoundException('Tontine introuvable.');
    await this.verifierPropriete(tontine, adminId, estSuperAdmin);

    const membresIds = tontine.membres.map((m) => m.userId);
    return this.prisma.user.findMany({
      where: {
        id: { notIn: membresIds },
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { nom: { contains: q, mode: 'insensitive' } },
          { prenom: { contains: q, mode: 'insensitive' } },
          { telephone: { contains: q } },
        ],
      },
      select: { id: true, nom: true, prenom: true, email: true, telephone: true },
      take: 10,
    });
  }

  /** Vérifie que l'administrateur donné possède bien cette tontine. */
  private async verifierPropriete(tontine: Tontine, adminId: string, estSuperAdmin = false) {
    if (estSuperAdmin) return;
    if (tontine.createurId !== adminId) {
      throw new ForbiddenException("Vous n'êtes pas l'administrateur de cette tontine.");
    }
  }

  /**
   * Démarre officiellement la tontine : exige que le nombre de membres
   * requis soit atteint. Passe le statut à ACTIVE et initialise le cycle à 1.
   */
  async demarrer(tontineId: string, adminId: string, estSuperAdmin = false) {
    const tontine = await this.prisma.tontine.findUnique({
      where: { id: tontineId },
      include: { membres: true },
    });
    if (!tontine) throw new NotFoundException('Tontine introuvable.');
    await this.verifierPropriete(tontine, adminId, estSuperAdmin);

    if (tontine.membres.length < tontine.nombreMaxMembres) {
      throw new BadRequestException(
        `Il manque des membres : ${tontine.membres.length}/${tontine.nombreMaxMembres} inscrits.`,
      );
    }

    const resultat = await this.prisma.tontine.update({
      where: { id: tontineId },
      data: { statut: TontineStatus.ACTIVE, dateDebut: new Date(), cycleActuel: 1 },
    });
    await this.audit.log('TONTINE_DEMARRÉE', tontineId, adminId, { nom: tontine.nom });
    return resultat;
  }

  /**
   * Enregistre une cotisation réussie, de façon atomique.
   *
   * Un verrou advisory PostgreSQL propre à la tontine sérialise les paiements
   * concurrents : le contrôle « déjà payé », la commission, la régularisation
   * du statut membre, la clôture du cycle et le versement sont dans la MÊME
   * transaction. Deux appels simultanés ne peuvent donc pas payer deux fois
   * le même cycle ni verser deux fois la cagnotte.
   */
  async enregistrerCotisation(
    tontineId: string,
    userId: string,
    provider: PaymentProvider,
    referenceExterne?: string,
    pendingPaymentId?: string,
  ) {
    // Objet conteneur : TypeScript ne suit pas les affectations faites dans
    // le callback de $transaction, on lit donc via une référence stable.
    const evenement: { cloture: EvenementCloture | null } = { cloture: null };

    const cotisation = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tontineId}))`;

      const tontine = await tx.tontine.findUnique({ where: { id: tontineId } });
      if (!tontine) throw new NotFoundException('Tontine introuvable.');
      if (tontine.statut !== TontineStatus.ACTIVE) {
        throw new BadRequestException("Cette tontine n'est pas active.");
      }

      const membre = await tx.tontineMember.findUnique({
        where: { tontineId_userId: { tontineId, userId } },
      });
      if (!membre) throw new NotFoundException("Vous n'êtes pas membre de cette tontine.");

      const dejaPaye = await tx.transaction.findFirst({
        where: {
          tontineMemberId: membre.id,
          type: TransactionType.COTISATION,
          cycleConcerne: tontine.cycleActuel,
          statut: TransactionStatus.REUSSIE,
        },
      });
      if (dejaPaye) throw new ConflictException('Cotisation déjà payée pour ce cycle.');

      const montantBrut = Number(tontine.montantCotisation);
      const { montantCommission, montantNet } = calculerCommissionCotisation(
        montantBrut,
        Number(tontine.tauxCommission),
      );
      const cycleConcerne = tontine.cycleActuel;

      const cotisationCreee = await tx.transaction.create({
        data: {
          type: TransactionType.COTISATION,
          statut: TransactionStatus.REUSSIE,
          provider,
          referenceExterne,
          montantBrut,
          montantCommission,
          montantNet,
          userId,
          tontineId,
          tontineMemberId: membre.id,
          cycleConcerne,
        },
      });

      // Transaction COMMISSION séparée pour l'agrégation du CA admin.
      await tx.transaction.create({
        data: {
          type: TransactionType.COMMISSION,
          statut: TransactionStatus.REUSSIE,
          montantBrut: montantCommission,
          montantCommission,
          montantNet: 0,
          userId,
          tontineId,
          tontineMemberId: membre.id,
          cycleConcerne,
        },
      });

      // Un membre en retard est réactivé dès qu'il régularise sa cotisation.
      if (membre.statut === MemberStatus.EN_RETARD) {
        await tx.tontineMember.update({
          where: { id: membre.id },
          data: { statut: MemberStatus.ACTIF },
        });
      }

      // Le paiement simulé et le webhook passent par le même point de sortie :
      // le PendingPayment est clôturé dans la même transaction que la cotisation.
      if (pendingPaymentId) {
        await tx.pendingPayment.update({
          where: { id: pendingPaymentId },
          data: {
            statut: 'REUSSIE',
            webhookRecu: true,
            dateWebhook: new Date(),
            ...(referenceExterne ? { referenceExterne } : {}),
          },
        });
      }

      evenement.cloture = await this.verifierEtCloturerCycle(tx, tontineId);
      return cotisationCreee;
    });

    if (evenement.cloture) {
      await this.notifications.notifierVersement(
        evenement.cloture.beneficiaireUserId,
        evenement.cloture.nomTontine,
        evenement.cloture.montant,
        evenement.cloture.cycle,
      );
    }

    return cotisation;
  }

  /**
   * Vérifie si tous les participants ont payé le cycle en cours, verse la
   * cagnotte au bénéficiaire du tour puis avance au cycle suivant (ou clôture
   * la tontine). La somme versée est celle des montants NETS réellement
   * enregistrés dans le ledger, donc toujours cohérente avec les commissions.
   */
  private async verifierEtCloturerCycle(
    tx: TransactionClient,
    tontineId: string,
  ): Promise<EvenementCloture | null> {
    const tontine = await tx.tontine.findUnique({
      where: { id: tontineId },
      include: { membres: true },
    });
    if (!tontine || tontine.statut !== TontineStatus.ACTIVE) return null;

    // Un membre EXCLU ne participe plus : il n'est plus attendu ni payé.
    // SORTIE et EN_RETARD restent dans la rotation et continuent de cotiser.
    const participants = tontine.membres.filter((m) => m.statut !== MemberStatus.EXCLU);
    if (participants.length === 0) return null;

    const versementExistant = await tx.transaction.findFirst({
      where: {
        tontineId,
        type: TransactionType.VERSEMENT_GAGNANT,
        cycleConcerne: tontine.cycleActuel,
      },
    });
    if (versementExistant) return null; // Cycle déjà clôturé

    const cotisations = await tx.transaction.count({
      where: {
        tontineId,
        type: TransactionType.COTISATION,
        statut: TransactionStatus.REUSSIE,
        cycleConcerne: tontine.cycleActuel,
        tontineMemberId: { in: participants.map((m) => m.id) },
      },
    });
    if (cotisations < participants.length) return null; // Cycle incomplet

    const beneficiaire =
      participants.find((m) => m.ordrePassage === tontine.cycleActuel) ??
      participants
        .filter((m) => m.ordrePassage > tontine.cycleActuel)
        .sort((a, b) => a.ordrePassage - b.ordrePassage)[0] ??
      participants.slice().sort((a, b) => a.ordrePassage - b.ordrePassage)[0];
    if (!beneficiaire) return null;

    const netAgg = await tx.transaction.aggregate({
      where: {
        tontineId,
        type: TransactionType.COTISATION,
        statut: TransactionStatus.REUSSIE,
        cycleConcerne: tontine.cycleActuel,
      },
      _sum: { montantNet: true },
    });
    const montantAVerser = Number(netAgg._sum.montantNet ?? 0);

    await tx.transaction.create({
      data: {
        type: TransactionType.VERSEMENT_GAGNANT,
        statut: TransactionStatus.REUSSIE, // En prod : EN_ATTENTE jusqu'au webhook sortant
        montantBrut: montantAVerser,
        montantCommission: 0,
        montantNet: montantAVerser,
        userId: beneficiaire.userId,
        tontineId,
        tontineMemberId: beneficiaire.id,
        cycleConcerne: tontine.cycleActuel,
      },
    });
    await tx.tontineMember.update({
      where: { id: beneficiaire.id },
      data: { aDejaRecu: true, dateReception: new Date() },
    });

    const dernierCycle = tontine.cycleActuel >= participants.length;
    await tx.tontine.update({
      where: { id: tontineId },
      data: dernierCycle
        ? { statut: TontineStatus.TERMINEE }
        : { cycleActuel: { increment: 1 } },
    });

    return {
      beneficiaireUserId: beneficiaire.userId,
      montant: montantAVerser,
      cycle: tontine.cycleActuel,
      nomTontine: tontine.nom,
    };
  }
}
