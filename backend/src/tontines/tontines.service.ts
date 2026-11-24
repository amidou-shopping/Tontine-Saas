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
  CalculArriere,
  ParametresFinanciers,
  calculerArriere,
} from '../common/finances.util';
import { lireParametresFinanciers } from '../common/parametres-financiers';
import { demainUTC, prochainJour } from '../common/dates.util';
import {
  JourSemaine,
  MemberStatus,
  PaymentProvider,
  Prisma,
  Role,
  StatutDemandeAdhesion,
  Tontine,
  TontineFrequency,
  TontineMember,
  TontineStatus,
  TontineType,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { randomBytes, randomInt } from 'crypto';

type ClientPrisma = Prisma.TransactionClient | PrismaService;

interface RemboursementEvent {
  userId: string;
  montant: number;
  nomTontine: string;
}

interface EvenementCloture {
  beneficiaireUserId: string;
  montant: number;
  cycle: number;
  nomTontine: string;
  remboursements: RemboursementEvent[];
}

interface EvenementAmende {
  beneficiaireUserId: string;
  montant: number;
  cycle: number;
  nomTontine: string;
}

export interface AnalysePaiement {
  tontine: Tontine;
  membre: TontineMember;
  parametres: ParametresFinanciers;
  montantCotisation: number;
  cycleCourantPaye: boolean;
  arriere: CalculArriere | null;
}

export interface CycleCible {
  cycle: number;
  montantCotisation: number;
  montantAmende: number;
  montantTotal: number;
  arriere: CalculArriere | null;
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

  /** Liste les tontines créées par un ADMIN_TONTINE, avec les demandes à traiter. */
  async mesTontinesAdmin(createurId: string) {
    return this.prisma.tontine.findMany({
      where: { createurId },
      include: {
        _count: {
          select: {
            membres: true,
            demandesAdhesion: { where: { statut: StatutDemandeAdhesion.EN_ATTENTE } },
          },
        },
        demandesAdhesion: {
          where: { statut: StatutDemandeAdhesion.EN_ATTENTE },
          include: {
            user: { select: { id: true, nom: true, prenom: true, email: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        membres: {
          include: {
            user: { select: { id: true, nom: true, prenom: true, email: true } },
          },
          orderBy: { ordrePassage: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Crée une tontine à l'état EN_ATTENTE avec le taux de la configuration globale. */
  async creer(createurId: string, dto: CreateTontineDto) {
    const createur = await this.prisma.user.findUnique({ where: { id: createurId } });
    if (!createur) throw new NotFoundException('Utilisateur introuvable.');

    // Phase 3 : un MEMBER ne peut pas créer de tontine, même s'il pourrait
    // payer un abonnement. Le passage au rôle ADMIN_TONTINE passe par une
    // action explicite et auditable (POST /member/devenir-admin).
    if (createur.role === Role.MEMBER) {
      throw new ForbiddenException(
        'Seuls les administrateurs de tontine peuvent créer une tontine. Utilisez « Devenir Admin » pour continuer.',
      );
    }

    // Le Super-Admin de la plateforme n'est pas soumis aux limits d'abonnement.
    if (createur.role !== Role.SUPER_ADMIN) {
      const peutCreer = await this.subscriptions.peutCreerTontine(createurId);
      if (!peutCreer) {
        throw new ForbiddenException(
          'Limite d\'abonnement atteinte : changez de plan pour créer une nouvelle tontine.',
        );
      }
    }

    const parametres = await lireParametresFinanciers(this.prisma);
    const codeInvitation = randomBytes(4).toString('hex').toUpperCase(); // 8 caractères hex
    const tontine = await this.prisma.tontine.create({
      data: {
        nom: dto.nom,
        description: dto.description,
        type: dto.type ?? TontineType.CLASSIQUE,
        montantCotisation: dto.montantCotisation,
        // Nouveau modèle : une cotisation par semaine, au jour choisi.
        frequence: TontineFrequency.HEBDOMADAIRE,
        jourCotisation: dto.jourCotisation ?? JourSemaine.LUNDI,
        nombreMaxMembres: dto.nombreMaxMembres,
        tauxCommission: parametres.tauxCommission,
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

  /** Demande à rejoindre une tontine via son code d'invitation. */
  async rejoindreParCode(codeInvitation: string, userId: string) {
    const tontine = await this.prisma.tontine.findUnique({
      where: { codeInvitation: codeInvitation.trim().toUpperCase() },
      include: { membres: true },
    });
    if (!tontine) throw new NotFoundException('Code d\'invitation invalide.');
    return this.soumettreDemande(tontine, userId);
  }

  /**
   * Demande à rejoindre une tontine EN_ATTENTE. L'ordre de passage n'est plus
   * attribué à l'inscription : il est tiré au sort au démarrage (Phase 3).
   */
  async rejoindre(tontineId: string, userId: string) {
    const tontine = await this.prisma.tontine.findUnique({
      where: { id: tontineId },
      include: { membres: true },
    });
    if (!tontine) throw new NotFoundException('Tontine introuvable.');
    return this.soumettreDemande(tontine, userId);
  }

  /** Crée une DEMANDE d'adhésion (plus aucune inscription directe). */
  private async soumettreDemande(tontine: Tontine & { membres: TontineMember[] }, userId: string) {
    if (tontine.statut !== TontineStatus.EN_ATTENTE) {
      throw new BadRequestException(
        'Cette tontine a déjà démarré ou est terminée, impossible de demander à la rejoindre.',
      );
    }
    if (tontine.membres.length >= tontine.nombreMaxMembres) {
      throw new BadRequestException('Cette tontine est complète.');
    }
    if (tontine.membres.some((m) => m.userId === userId)) {
      throw new ConflictException('Vous êtes déjà inscrit(e) dans cette tontine.');
    }

    const enAttente = await this.prisma.demandeAdhesion.findFirst({
      where: {
        tontineId: tontine.id,
        userId,
        statut: StatutDemandeAdhesion.EN_ATTENTE,
      },
    });
    if (enAttente) {
      throw new ConflictException('Votre demande est déjà en attente de validation.');
    }

    const demande = await this.prisma.demandeAdhesion.create({
      data: { tontineId: tontine.id, userId },
    });
    await this.notifications.creerNotification(
      tontine.createurId,
      'Nouvelle demande d’adhésion',
      `Un membre souhaite rejoindre « ${tontine.nom} ». Acceptez ou refusez sa demande depuis la gestion des tontines.`,
      'INFO',
    );

    return {
      message: 'Demande envoyée à l’administrateur de la tontine.',
      demandeId: demande.id,
      statut: demande.statut,
      tontineId: tontine.id,
    };
  }

  /** Toutes les demandes d'une tontine, pour son administrateur. */
  async listerDemandes(tontineId: string, adminId: string, estSuperAdmin = false) {
    const tontine = await this.prisma.tontine.findUnique({ where: { id: tontineId } });
    if (!tontine) throw new NotFoundException('Tontine introuvable.');
    await this.verifierPropriete(tontine, adminId, estSuperAdmin);

    return this.prisma.demandeAdhesion.findMany({
      where: { tontineId },
      include: {
        user: { select: { id: true, nom: true, prenom: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Accepte ou refuse une demande dans une transaction : vérifications de
   * capacité refaites sous verrou advisory, création du membre et notification
   * au demandeur. Aucune élévation de rôle n'est possible ici.
   */
  async repondreDemande(
    demandeId: string,
    adminId: string,
    accepter: boolean,
    motifRefus?: string,
    estSuperAdmin = false,
  ) {
    const resultat = await this.prisma.$transaction(async (tx) => {
      const demande = await tx.demandeAdhesion.findUnique({
        where: { id: demandeId },
        include: { tontine: true },
      });
      if (!demande) throw new NotFoundException('Demande introuvable.');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${demande.tontineId}))`;

      const tontine = await tx.tontine.findUnique({
        where: { id: demande.tontineId },
        include: { membres: true },
      });
      if (!tontine) throw new NotFoundException('Tontine introuvable.');
      await this.verifierPropriete(tontine, adminId, estSuperAdmin);

      if (demande.statut !== StatutDemandeAdhesion.EN_ATTENTE) {
        throw new ConflictException('Cette demande a déjà été traitée.');
      }

      if (!accepter) {
        await tx.demandeAdhesion.update({
          where: { id: demandeId },
          data: {
            statut: StatutDemandeAdhesion.REFUSEE,
            motifRefus: motifRefus?.trim() || null,
            traiteeAt: new Date(),
            traiteeParId: adminId,
          },
        });
        return { accepte: false, userId: demande.userId, nomTontine: tontine.nom, motif: motifRefus?.trim() };
      }

      if (tontine.statut !== TontineStatus.EN_ATTENTE) {
        throw new BadRequestException('La tontine a déjà démarré : la demande ne peut plus être acceptée.');
      }
      if (tontine.membres.length >= tontine.nombreMaxMembres) {
        throw new BadRequestException('La tontine est complète.');
      }
      if (tontine.membres.some((m) => m.userId === demande.userId)) {
        throw new ConflictException('Cet utilisateur est déjà membre de la tontine.');
      }

      const prochainOrdre =
        tontine.membres.reduce((maximum, membre) => Math.max(maximum, membre.ordrePassage), 0) + 1;
      await tx.tontineMember.create({
        data: { tontineId: tontine.id, userId: demande.userId, ordrePassage: prochainOrdre },
      });
      await tx.demandeAdhesion.update({
        where: { id: demandeId },
        data: {
          statut: StatutDemandeAdhesion.ACCEPTEE,
          traiteeAt: new Date(),
          traiteeParId: adminId,
        },
      });
      return { accepte: true, userId: demande.userId, nomTontine: tontine.nom, motif: undefined };
    });

    if (resultat.accepte) {
      await this.notifications.creerNotification(
        resultat.userId,
        'Demande acceptée',
        `Votre demande pour rejoindre « ${resultat.nomTontine} » a été acceptée.`,
        'SUCCESS',
      );
    } else {
      await this.notifications.creerNotification(
        resultat.userId,
        'Demande refusée',
        `Votre demande pour rejoindre « ${resultat.nomTontine} » a été refusée.` +
          (resultat.motif ? ` Motif : ${resultat.motif}` : ''),
        'WARNING',
      );
    }

    return {
      message: resultat.accepte
        ? 'Demande acceptée : le membre a rejoint la tontine.'
        : 'Demande refusée.',
      ...resultat,
    };
  }

  /** Exclut un membre ; le net réglé lui sera remboursé à la clôture. */
  async exclureMembre(tontineId: string, userId: string, adminId: string, estSuperAdmin = false) {
    const tontine = await this.prisma.tontine.findUnique({
      where: { id: tontineId },
      include: { membres: true },
    });
    if (!tontine) throw new NotFoundException('Tontine introuvable.');
    await this.verifierPropriete(tontine, adminId, estSuperAdmin);

    if (tontine.statut === TontineStatus.TERMINEE) {
      throw new BadRequestException('Cette tontine est terminée : exclusion impossible.');
    }
    if (userId === tontine.createurId) {
      throw new BadRequestException('Le créateur de la tontine ne peut pas être exclu.');
    }
    const membre = tontine.membres.find((m) => m.userId === userId);
    if (!membre) throw new NotFoundException('Membre introuvable dans cette tontine.');
    if (membre.statut === MemberStatus.EXCLU) {
      throw new ConflictException('Ce membre est déjà exclu.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tontineMember.update({
        where: { id: membre.id },
        data: { statut: MemberStatus.EXCLU },
      });
      await tx.demandeAdhesion.updateMany({
        where: {
          tontineId,
          userId,
          statut: StatutDemandeAdhesion.EN_ATTENTE,
        },
        data: {
          statut: StatutDemandeAdhesion.REFUSEE,
          motifRefus: 'Membre exclu par l’administrateur.',
          traiteeAt: new Date(),
          traiteeParId: adminId,
        },
      });
    });

    await this.audit.log('MEMBRE_EXCLU', membre.id, adminId, { tontineId, userId });
    await this.notifications.creerNotification(
      userId,
      'Exclusion d’une tontine',
      `Vous avez été exclu de « ${tontine.nom} ». Les sommes réglées vous seront remboursées à la clôture de la tontine.`,
      'WARNING',
    );

    return {
      message: 'Membre exclu. Remboursement à la clôture de la tontine.',
    };
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

    // Le premier tour a lieu au prochain jour de cotisation (au plus tôt demain),
    // à minuit UTC : toutes les échéances sont ensuite déduites de dateDuTour.
    const dateDebut = prochainJour(demainUTC(), tontine.jourCotisation);
    const resultat = await this.prisma.$transaction(async (tx) => {
      // Phase 3 : l'ordre de passage est tiré au sort (Fisher-Yates avec
      // randomInt) au démarrage, et plus à l'inscription. Les rangs sont
      // d'abord libérés avec des valeurs négatives pour respecter l'unicité
      // (tontineId, ordrePassage) pendant la réattribution.
      const membres = await tx.tontineMember.findMany({
        where: { tontineId },
        select: { id: true },
      });
      const ordreAleatoire = membres.map((m) => m.id);
      for (let i = ordreAleatoire.length - 1; i > 0; i--) {
        const j = randomInt(0, i + 1);
        [ordreAleatoire[i], ordreAleatoire[j]] = [ordreAleatoire[j], ordreAleatoire[i]];
      }
      for (let i = 0; i < ordreAleatoire.length; i++) {
        await tx.tontineMember.update({
          where: { id: ordreAleatoire[i] },
          data: { ordrePassage: -(i + 1) },
        });
      }
      for (let i = 0; i < ordreAleatoire.length; i++) {
        await tx.tontineMember.update({
          where: { id: ordreAleatoire[i] },
          data: { ordrePassage: i + 1 },
        });
      }

      return tx.tontine.update({
        where: { id: tontineId },
        data: { statut: TontineStatus.ACTIVE, dateDebut, cycleActuel: 1 },
      });
    });
    await this.audit.log('TONTINE_DEMARRÉE', tontineId, adminId, {
      nom: tontine.nom,
      dateDebut,
      jourCotisation: tontine.jourCotisation,
      ordrePassageTireAuSort: true,
    });
    return resultat;
  }

  /** État de paiement d'un membre : cycle courant, arriéré éventuel et montants. */
  async etatPaiement(tontineId: string, userId: string): Promise<AnalysePaiement> {
    return this.analyserEtat(tontineId, userId, this.prisma);
  }

  /**
   * Détermine, AVANT l'initialisation du paiement, quel cycle doit être réglé.
   * Les contrôles définitifs sont refaits dans `enregistrerCotisation` sous le
   * verrou advisory : cette lecture sert seulement à calculer le montant à
   * présenter au provider (simulation et webhook suivent le même chemin).
   */
  async analyserPaiement(
    tontineId: string,
    userId: string,
    cycleDemande?: number,
  ): Promise<CycleCible> {
    const analyse = await this.etatPaiement(tontineId, userId);
    return this.choisirCycleCible(analyse, cycleDemande);
  }

  private choisirCycleCible(analyse: AnalysePaiement, cycleDemande?: number): CycleCible {
    const { tontine, arriere, montantCotisation } = analyse;

    if (arriere) {
      if (cycleDemande !== arriere.cycle) {
        throw new ConflictException(
          `Arriéré non réglé : tour ${arriere.cycle}, ${arriere.montantTotal.toLocaleString('fr-FR')} FCFA ` +
            `(dont ${arriere.amende.toLocaleString('fr-FR')} FCFA d'amende). ` +
            `Réglez d'abord cet arriéré avant de payer le tour ${tontine.cycleActuel}.`,
        );
      }
      return {
        cycle: arriere.cycle,
        montantCotisation: arriere.cotisationDue,
        montantAmende: arriere.amende,
        montantTotal: arriere.montantTotal,
        arriere,
      };
    }

    if (cycleDemande !== undefined && cycleDemande !== tontine.cycleActuel) {
      throw new BadRequestException(
        `Le tour ${cycleDemande} n'est pas à régler (tour en cours : ${tontine.cycleActuel}).`,
      );
    }
    if (analyse.cycleCourantPaye) {
      throw new ConflictException('Cotisation déjà payée pour ce cycle.');
    }

    return {
      cycle: tontine.cycleActuel,
      montantCotisation,
      montantAmende: 0,
      montantTotal: montantCotisation,
      arriere: null,
    };
  }

  private async analyserEtat(
    tontineId: string,
    userId: string,
    client: ClientPrisma,
  ): Promise<AnalysePaiement> {
    const tontine = await client.tontine.findUnique({ where: { id: tontineId } });
    if (!tontine) throw new NotFoundException('Tontine introuvable.');
    if (tontine.statut !== TontineStatus.ACTIVE) {
      throw new BadRequestException("Cette tontine n'est pas active.");
    }

    const membre = await client.tontineMember.findUnique({
      where: { tontineId_userId: { tontineId, userId } },
    });
    if (!membre) throw new NotFoundException("Vous n'êtes pas membre de cette tontine.");
    if (membre.statut === MemberStatus.EXCLU) {
      throw new ForbiddenException(
        'Vous avez été exclu de cette tontine. Le montant réglé vous sera remboursé à la clôture.',
      );
    }

    const parametres = await lireParametresFinanciers(client);
    const montantCotisation = Number(tontine.montantCotisation);
    const cycleCourantPaye = await this.estPaye(client, membre.id, tontine.cycleActuel);

    let arriere: CalculArriere | null = null;
    if (tontine.cycleActuel > 1) {
      const cyclePrecedent = tontine.cycleActuel - 1;
      if (!(await this.estPaye(client, membre.id, cyclePrecedent))) {
        arriere = calculerArriere(
          parametres,
          tontine.dateDebut ?? tontine.createdAt,
          cyclePrecedent,
          montantCotisation,
        );
      }
    }

    return { tontine, membre, parametres, montantCotisation, cycleCourantPaye, arriere };
  }

  private async estPaye(client: ClientPrisma, membreId: string, cycle: number): Promise<boolean> {
    const cotisation = await client.transaction.findFirst({
      where: {
        tontineMemberId: membreId,
        type: TransactionType.COTISATION,
        cycleConcerne: cycle,
        statut: TransactionStatus.REUSSIE,
      },
    });
    return Boolean(cotisation);
  }

  /**
   * Enregistre une cotisation réussie, de façon atomique.
   *
   * Un verrou advisory PostgreSQL propre à la tontine sérialise les paiements
   * concurrents : blocage des arriérés, amende unique, commission, régularisation
   * du statut membre, clôture du cycle et versement sont dans la MÊME transaction.
   */
  async enregistrerCotisation(
    tontineId: string,
    userId: string,
    provider: PaymentProvider,
    referenceExterne?: string,
    pendingPaymentId?: string,
    cycleDemande?: number,
  ) {
    const evenement: {
      cloture: EvenementCloture | null;
      amende: EvenementAmende | null;
    } = { cloture: null, amende: null };

    const cotisation = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tontineId}))`;

      const analyse = await this.analyserEtat(tontineId, userId, tx);
      const cible = this.choisirCycleCible(analyse, cycleDemande);
      const { tontine, membre, parametres } = analyse;

      const { montantCommission, montantNet } = calculerCommissionCotisation(
        cible.montantCotisation,
        parametres.tauxCommission,
      );

      const participants = await tx.tontineMember.findMany({
        where: { tontineId, statut: { not: MemberStatus.EXCLU } },
        orderBy: { ordrePassage: 'asc' },
      });

      // L'amende n'est créée qu'après le délai de grâce, une seule fois par
      // cotisation en retard (contrainte d'unicité DB + verrou advisory).
      if (cible.arriere && cible.montantAmende > 0) {
        const beneficiaire = this.beneficiaireDuTour(participants, tontine.cycleActuel);
        if (!beneficiaire) throw new BadRequestException('Bénéficiaire du tour introuvable.');

        const amendeExistante = await tx.amendeRetard.findUnique({
          where: {
            tontineMemberId_cycleConcerne: {
              tontineMemberId: membre.id,
              cycleConcerne: cible.cycle,
            },
          },
        });

        if (!amendeExistante) {
          const transactionAmende = await tx.transaction.create({
            data: {
              type: TransactionType.AMENDE_RETARD,
              statut: TransactionStatus.REUSSIE,
              montantBrut: cible.montantAmende,
              montantCommission: 0, // aucune commission sur l'amende
              montantNet: cible.montantAmende,
              userId,
              beneficiaireUserId: beneficiaire.userId,
              tontineId,
              tontineMemberId: membre.id,
              cycleConcerne: tontine.cycleActuel, // payable au bénéficiaire du tour en cours
            },
          });
          await tx.amendeRetard.create({
            data: {
              tontineId,
              tontineMemberId: membre.id,
              cycleConcerne: cible.cycle,
              montant: cible.montantAmende,
              beneficiaireUserId: beneficiaire.userId,
              transactionId: transactionAmende.id,
            },
          });
          await tx.tontineMember.update({
            where: { id: membre.id },
            data: { statut: MemberStatus.EN_RETARD },
          });
          evenement.amende = {
            beneficiaireUserId: beneficiaire.userId,
            montant: cible.montantAmende,
            cycle: tontine.cycleActuel,
            nomTontine: tontine.nom,
          };
        }
      }

      const cotisationCreee = await tx.transaction.create({
        data: {
          type: TransactionType.COTISATION,
          statut: TransactionStatus.REUSSIE,
          provider,
          referenceExterne,
          montantBrut: cible.montantCotisation,
          montantCommission,
          montantNet,
          userId,
          tontineId,
          tontineMemberId: membre.id,
          cycleConcerne: cible.cycle,
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
          cycleConcerne: cible.cycle,
        },
      });

      // Un membre en retard est réactivé dès qu'il a réglé le tour courant.
      if (membre.statut === MemberStatus.EN_RETARD && !cible.arriere) {
        await tx.tontineMember.update({
          where: { id: membre.id },
          data: { statut: MemberStatus.ACTIF },
        });
      }

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

    if (evenement.amende) {
      await this.notifications.creerNotification(
        evenement.amende.beneficiaireUserId,
        'Amende de retard perçue',
        `Une amende de ${evenement.amende.montant.toLocaleString('fr-FR')} FCFA dans « ${evenement.amende.nomTontine} » (tour ${evenement.amende.cycle}) vous a été versée.`,
        'INFO',
      );
    }
    if (evenement.cloture) {
      await this.notifications.notifierVersement(
        evenement.cloture.beneficiaireUserId,
        evenement.cloture.nomTontine,
        evenement.cloture.montant,
        evenement.cloture.cycle,
      );
      for (const remboursement of evenement.cloture.remboursements) {
        await this.notifications.creerNotification(
          remboursement.userId,
          'Remboursement de tontine',
          `Votre exclusion de « ${remboursement.nomTontine} » entraîne le remboursement de ${remboursement.montant.toLocaleString('fr-FR')} FCFA.`,
          'INFO',
        );
      }
    }

    return cotisation;
  }

  /** Bénéficiaire du tour : rang courant, sinon premier rang encore actif. */
  private beneficiaireDuTour(participants: TontineMember[], cycle: number): TontineMember | null {
    return (
      participants.find((m) => m.ordrePassage === cycle) ??
      participants.filter((m) => m.ordrePassage > cycle).sort((a, b) => a.ordrePassage - b.ordrePassage)[0] ??
      participants.slice().sort((a, b) => a.ordrePassage - b.ordrePassage)[0] ??
      null
    );
  }

  /**
   * Vérifie si tous les participants ont payé le cycle en cours, verse la
   * cagnotte au bénéficiaire du tour puis avance au cycle suivant. Le montant
   * versé est la somme des nets réellement enregistrés : cotisations moins
   * commissions, plus amendes (jamais commissionnées).
   */
  private async verifierEtCloturerCycle(
    tx: Prisma.TransactionClient,
    tontineId: string,
  ): Promise<EvenementCloture | null> {
    const tontine = await tx.tontine.findUnique({
      where: { id: tontineId },
      include: { membres: true },
    });
    if (!tontine || tontine.statut !== TontineStatus.ACTIVE) return null;

    // Un membre EXCLU ne participe plus : il n'est plus attendu ni payé.
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

    const beneficiaire = this.beneficiaireDuTour(participants, tontine.cycleActuel);
    if (!beneficiaire) return null;

    const [netCotisations, netAmendes] = await Promise.all([
      tx.transaction.aggregate({
        where: {
          tontineId,
          type: TransactionType.COTISATION,
          statut: TransactionStatus.REUSSIE,
          cycleConcerne: tontine.cycleActuel,
        },
        _sum: { montantNet: true },
      }),
      tx.transaction.aggregate({
        where: {
          tontineId,
          type: TransactionType.AMENDE_RETARD,
          statut: TransactionStatus.REUSSIE,
          cycleConcerne: tontine.cycleActuel,
        },
        _sum: { montantNet: true },
      }),
    ]);
    const montantAVerser =
      Number(netCotisations._sum.montantNet ?? 0) + Number(netAmendes._sum.montantNet ?? 0);

    await tx.transaction.create({
      data: {
        type: TransactionType.VERSEMENT_GAGNANT,
        statut: TransactionStatus.REUSSIE, // En prod : EN_ATTENTE jusqu'au webhook sortant
        montantBrut: montantAVerser,
        montantCommission: 0, // 0% à la distribution
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

    const remboursements = dernierCycle
      ? await this.rembourserMembresExclus(tx, tontine)
      : [];

    return {
      beneficiaireUserId: beneficiaire.userId,
      montant: montantAVerser,
      cycle: tontine.cycleActuel,
      nomTontine: tontine.nom,
      remboursements,
    };
  }

  /**
   * À la clôture, chaque membre exclu est remboursé une seule fois du net
   * réellement réglé (cotisations après commission + amendes), sans nouvelle
   * commission prélevée sur le remboursement.
   */
  private async rembourserMembresExclus(
    tx: Prisma.TransactionClient,
    tontine: Tontine & { membres: TontineMember[] },
  ): Promise<RemboursementEvent[]> {
    const evenements: RemboursementEvent[] = [];
    const exclus = tontine.membres.filter((m) => m.statut === MemberStatus.EXCLU);

    for (const membre of exclus) {
      const dejaRembourse = await tx.transaction.findFirst({
        where: {
          tontineId: tontine.id,
          tontineMemberId: membre.id,
          type: TransactionType.REMBOURSEMENT,
          statut: TransactionStatus.REUSSIE,
        },
      });
      if (dejaRembourse) continue;

      const [cotisations, amendes] = await Promise.all([
        tx.transaction.aggregate({
          where: {
            tontineId: tontine.id,
            tontineMemberId: membre.id,
            type: TransactionType.COTISATION,
            statut: TransactionStatus.REUSSIE,
          },
          _sum: { montantNet: true },
        }),
        tx.transaction.aggregate({
          where: {
            tontineId: tontine.id,
            tontineMemberId: membre.id,
            type: TransactionType.AMENDE_RETARD,
            statut: TransactionStatus.REUSSIE,
          },
          _sum: { montantNet: true },
        }),
      ]);

      const montant = Math.trunc(
        Number(cotisations._sum.montantNet ?? 0) + Number(amendes._sum.montantNet ?? 0),
      );
      if (montant <= 0) continue;

      await tx.transaction.create({
        data: {
          type: TransactionType.REMBOURSEMENT,
          statut: TransactionStatus.REUSSIE,
          provider: PaymentProvider.VIREMENT,
          montantBrut: montant,
          montantCommission: 0,
          montantNet: montant,
          userId: membre.userId,
          tontineId: tontine.id,
          tontineMemberId: membre.id,
        },
      });
      evenements.push({ userId: membre.userId, montant, nomTontine: tontine.nom });
    }

    return evenements;
  }
}
