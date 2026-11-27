import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis.service';
import { AuditService } from '../audit/audit.service';
import { lireFraisPassageAdmin } from '../common/parametres-financiers';
import { TontinesService } from '../tontines/tontines.service';
import { WaveProvider } from './providers/wave.provider';
import { OrangeMoneyProvider } from './providers/orange-money.provider';
import { PaytechProvider } from './providers/paytech.provider';
import { PaymentProviderClient } from './providers/payment-provider.interface';
import { trouverSignatureHeader } from './providers/signature.util';
import {
  PaymentProvider,
  PlanAbonnement,
  Role,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';

const WEBHOOK_MAX_AGE_SECONDS = 5 * 60;

@Injectable()
export class PaymentsService {
  private readonly providers: Record<string, PaymentProviderClient>;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private audit: AuditService,
    private tontinesService: TontinesService,
    wave: WaveProvider,
    orangeMoney: OrangeMoneyProvider,
    paytech: PaytechProvider,
  ) {
    this.providers = {
      WAVE: wave,
      ORANGE_MONEY: orangeMoney,
      PAYTECH: paytech,
      PAYDUNYA: paytech, // PayDunya utilise un flux très proche de PayTech
    };
  }

  private getProvider(nom: string): PaymentProviderClient {
    const provider = this.providers[nom];
    if (!provider) throw new BadRequestException(`Provider de paiement "${nom}" non supporté.`);
    return provider;
  }

  /**
   * Flux "simulé" du bouton « Payer ma cotisation » : même point de sortie que
   * le webhook (TontinesService.enregistrerCotisation), avec clôture du
   * PendingPayment dans la même transaction que la cotisation et la commission.
   */
  async payerCotisationSimule(
    tontineId: string,
    userId: string,
    providerName: string,
    telephone?: string,
    cycleDemande?: number,
  ) {
    const provider = this.getProvider(providerName);

    // Le service métier décide du cycle à régler et applique le blocage des
    // arriérés. Les contrôles seront refaits sous le verrou advisory lors de
    // l'enregistrement définitif.
    const cible = await this.tontinesService.analyserPaiement(
      tontineId,
      userId,
      cycleDemande,
    );
    const tontine = await this.prisma.tontine.findUnique({ where: { id: tontineId } });
    if (!tontine) throw new NotFoundException('Tontine introuvable.');
    const membre = await this.prisma.tontineMember.findUnique({
      where: { tontineId_userId: { tontineId, userId } },
    });
    if (!membre) throw new BadRequestException("Vous n'êtes pas membre de cette tontine.");

    const numero = telephone ?? (await this.prisma.user.findUnique({ where: { id: userId } }))?.telephone;
    const referenceInterne = `${tontineId}:${userId}:${cible.cycle}:${randomUUID()}`;

    // Le montant présenté au provider inclut l'amende : aucune commission
    // supplémentaire n'est prélevée dessus côté plateforme.
    const { referenceExterne } = await provider.initierPaiement(
      cible.montantTotal,
      numero ?? '',
      referenceInterne,
    );

    const pending = await this.prisma.pendingPayment.create({
      data: {
        tontineId,
        userId,
        tontineMemberId: membre.id,
        provider: providerName as PaymentProvider,
        referenceInterne,
        referenceExterne,
        montantBrut: cible.montantTotal,
        cycleConcerne: cible.cycle,
      },
    });

    return {
      statut: 'EN_ATTENTE',
      referenceInterne,
      referenceExterne,
      montant: cible.montantTotal,
      cycle: cible.cycle,
      message: 'Paiement initié. Confirmation requise par le provider.',
    };
  }

  /**
   * Initie le paiement unique MEMBER -> ADMIN_TONTINE. Le rôle n'est PAS
   * modifié ici : il ne le sera qu'après confirmation (simulation ou webhook).
   */
  async initierPassageAdmin(userId: string, providerName: string, telephone?: string) {
    const provider = this.getProvider(providerName);
    const utilisateur = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!utilisateur) throw new NotFoundException('Utilisateur introuvable.');
    if (utilisateur.role !== Role.MEMBER) {
      throw new ConflictException('Vous êtes déjà administrateur de tontine.');
    }
    if (!utilisateur.isVerified) {
      throw new ForbiddenException(
        'Votre numéro de téléphone doit être vérifié avant de devenir administrateur.',
      );
    }

    const dejaPaye = await this.prisma.transaction.findFirst({
      where: { userId, type: TransactionType.PASSAGE_ADMIN, statut: TransactionStatus.REUSSIE },
    });
    if (dejaPaye) throw new ConflictException('Le passage Admin a déjà été payé.');

    const enCours = await this.prisma.pendingPayment.findFirst({
      where: { userId, type: 'PASSAGE_ADMIN', statut: 'EN_ATTENTE' },
    });
    if (enCours) {
      throw new ConflictException(
        'Un paiement de passage Admin est déjà en cours. Confirmez-le avant d’en initier un autre.',
      );
    }

    const montant = await lireFraisPassageAdmin(this.prisma);
    const referenceInterne = `passage-admin:${userId}:${randomUUID()}`;
    const { referenceExterne } = await provider.initierPaiement(
      montant,
      telephone ?? utilisateur.telephone,
      referenceInterne,
    );

    await this.prisma.pendingPayment.create({
      data: {
        type: 'PASSAGE_ADMIN',
        userId,
        provider: providerName as PaymentProvider,
        referenceInterne,
        referenceExterne,
        montantBrut: montant,
      },
    });

    return {
      message: 'Paiement initié. Le rôle sera modifié après confirmation du paiement.',
      statut: 'EN_ATTENTE',
      referenceInterne,
      referenceExterne,
      montant,
      provider: providerName,
    };
  }

  /**
   * Confirmation (simulée ou webhook) : transaction, changement de rôle et
   * clôture du PendingPayment sont atomiques. Un verrou advisory rend la
   * confirmation idempotente même en cas de double clic / webhook en doublon.
   */
  async confirmerPassageAdmin(
    userId: string,
    referenceInterne: string,
    referenceExterne?: string,
  ) {
    const resultat = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

      const pending = await tx.pendingPayment.findUnique({ where: { referenceInterne } });
      if (!pending || pending.userId !== userId || pending.type !== 'PASSAGE_ADMIN') {
        throw new NotFoundException('Paiement de passage Admin introuvable.');
      }
      if (pending.statut === 'REUSSIE') {
        const paye = await tx.transaction.findFirst({
          where: { userId, type: TransactionType.PASSAGE_ADMIN, statut: TransactionStatus.REUSSIE },
        });
        return {
          dejaConfirme: true,
          role: Role.ADMIN_TONTINE,
          montant: Number(pending.montantBrut),
          provider: pending.provider,
          referenceInterne,
          transactionId: paye?.id ?? null,
        };
      }
      if (pending.statut !== 'EN_ATTENTE') {
        throw new ConflictException('Ce paiement de passage Admin n’est plus en attente.');
      }

      const utilisateur = await tx.user.findUnique({ where: { id: userId } });
      if (!utilisateur) throw new NotFoundException('Utilisateur introuvable.');
      if (utilisateur.role !== Role.MEMBER) {
        throw new ConflictException('Vous êtes déjà administrateur de tontine.');
      }
      if (!utilisateur.isVerified) {
        throw new ForbiddenException(
          'Votre numéro de téléphone doit être vérifié avant de devenir administrateur.',
        );
      }
      const dejaPaye = await tx.transaction.findFirst({
        where: { userId, type: TransactionType.PASSAGE_ADMIN, statut: TransactionStatus.REUSSIE },
      });
      if (dejaPaye) throw new ConflictException('Le passage Admin a déjà été payé.');

      const montant = Number(pending.montantBrut);
      const transaction = await tx.transaction.create({
        data: {
          type: TransactionType.PASSAGE_ADMIN,
          statut: TransactionStatus.REUSSIE,
          provider: pending.provider,
          referenceExterne: referenceExterne ?? pending.referenceExterne,
          montantBrut: montant,
          montantCommission: 0,
          montantNet: montant,
          userId,
        },
      });
      await tx.pendingPayment.update({
        where: { id: pending.id },
        data: {
          statut: 'REUSSIE',
          webhookRecu: true,
          dateWebhook: new Date(),
          ...(referenceExterne ? { referenceExterne } : {}),
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: { role: Role.ADMIN_TONTINE },
      });
      await tx.subscription.upsert({
        where: { userId },
        update: { actif: true },
        create: {
          userId,
          plan: PlanAbonnement.GRATUIT,
          prixMensuel: 0,
          actif: true,
        },
      });

      return {
        dejaConfirme: false,
        role: Role.ADMIN_TONTINE,
        montant,
        provider: pending.provider,
        referenceInterne,
        transactionId: transaction.id,
      };
    });

    if (!resultat.dejaConfirme) {
      await this.audit.log('PASSAGE_ADMIN_PAYE', userId, userId, {
        montant: resultat.montant,
        provider: resultat.provider,
        referenceInterne: resultat.referenceInterne,
        transactionId: resultat.transactionId,
      });
    }

    return {
      message: resultat.dejaConfirme
        ? 'Passage Admin déjà confirmé : aucun nouveau paiement n’a été effectué.'
        : 'Paiement confirmé : vous êtes désormais administrateur de tontine.',
      role: resultat.role,
      montant: resultat.montant,
    };
  }

  /**
   * Webhooks réels : signature HMAC sur le corps brut, timestamp et nonce
   * anti-replay, puis exactement le même traitement qu'un paiement simulé.
   */
  async traiterWebhook(
    providerName: string,
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
    payload: any,
  ) {
    const provider = this.getProvider(providerName);
    const signature = trouverSignatureHeader(headers);
    if (!provider.verifierSignatureWebhook(rawBody, signature, payload)) {
      throw new BadRequestException('Signature de webhook invalide.');
    }

    const timestamp = payload?.timestamp ?? payload?.date;
    if (timestamp !== undefined && this.timestampAncien(timestamp)) {
      throw new BadRequestException('Webhook trop ancien (rejeu probable).');
    }

    const nonce = payload?.nonce ?? payload?.event_id ?? payload?.id;
    if (nonce) {
      const cle = `webhook:nonce:${providerName}:${String(nonce)}`;
      const premierPassage = await this.redis.setnx(cle, WEBHOOK_MAX_AGE_SECONDS, '1');
      if (!premierPassage) return { received: true, message: 'Webhook déjà reçu (nonce).' };
    }

    const referenceInterne =
      payload?.reference ?? payload?.reference_interne ?? payload?.client_reference ?? payload?.ref_command;
    if (!referenceInterne) {
      throw new BadRequestException('Référence interne manquante dans le payload.');
    }

    const pending = await this.prisma.pendingPayment.findUnique({
      where: { referenceInterne: String(referenceInterne) },
    });
    if (!pending) {
      throw new BadRequestException('Paiement en attente introuvable pour cette référence.');
    }
    if (pending.webhookRecu || pending.statut === 'REUSSIE') {
      return { received: true, message: 'Webhook déjà traité.' };
    }
    if (pending.provider !== providerName) {
      throw new BadRequestException('Le provider du webhook ne correspond pas au paiement en attente.');
    }

    const statut = payload?.statut ?? payload?.status ?? payload?.state;
    const reussi = ['SUCCESS', 'success', 'REUSSIE', 'PAID', 'paid'].includes(statut);
    const referenceExterneWebhook = payload?.transaction_id ?? pending.referenceExterne ?? undefined;

    const marquerEchoue = async () => {
      await this.prisma.pendingPayment.update({
        where: { id: pending.id },
        data: { statut: 'ECHOUEE', webhookRecu: true, dateWebhook: new Date() },
      });
      return { received: true, statut: 'ECHOUEE' };
    };

    if (pending.type === 'PASSAGE_ADMIN') {
      if (!reussi) return marquerEchoue();
      await this.confirmerPassageAdmin(
        pending.userId,
        pending.referenceInterne,
        referenceExterneWebhook,
      );
      return { received: true, statut: 'REUSSIE', type: 'PASSAGE_ADMIN' };
    }

    if (!reussi) return marquerEchoue();
    if (!pending.tontineId || !pending.tontineMemberId) {
      throw new BadRequestException('Paiement de cotisation incomplet (tontine ou membre manquant).');
    }

    await this.tontinesService.enregistrerCotisation(
      pending.tontineId,
      pending.userId,
      pending.provider,
      referenceExterneWebhook,
      pending.id,
      pending.cycleConcerne ?? undefined,
    );

    return { received: true, statut: 'REUSSIE', type: 'COTISATION' };
  }

  private timestampAncien(valeur: unknown): boolean {
    const nombre = Number(valeur);
    if (!Number.isFinite(nombre)) return false;
    const secondes = nombre > 10_000_000_000 ? Math.floor(nombre / 1000) : nombre;
    return Math.abs(Math.floor(Date.now() / 1000) - secondes) > WEBHOOK_MAX_AGE_SECONDS;
  }
}
