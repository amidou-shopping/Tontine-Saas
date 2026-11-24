import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis.service';
import { TontinesService } from '../tontines/tontines.service';
import { WaveProvider } from './providers/wave.provider';
import { OrangeMoneyProvider } from './providers/orange-money.provider';
import { PaytechProvider } from './providers/paytech.provider';
import { PaymentProviderClient } from './providers/payment-provider.interface';
import { trouverSignatureHeader } from './providers/signature.util';
import { PaymentProvider } from '@prisma/client';

const WEBHOOK_MAX_AGE_SECONDS = 5 * 60;

@Injectable()
export class PaymentsService {
  private readonly providers: Record<string, PaymentProviderClient>;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
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

    try {
      return await this.tontinesService.enregistrerCotisation(
        tontineId,
        userId,
        providerName as PaymentProvider,
        referenceExterne,
        pending.id,
        cible.cycle,
      );
    } catch (erreur) {
      await this.prisma.pendingPayment.update({
        where: { id: pending.id },
        data: { statut: 'ECHOUEE', webhookRecu: true, dateWebhook: new Date() },
      });
      throw erreur;
    }
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

    if (!reussi) {
      await this.prisma.pendingPayment.update({
        where: { id: pending.id },
        data: {
          statut: 'ECHOUEE',
          webhookRecu: true,
          dateWebhook: new Date(),
        },
      });
      return { received: true, statut: 'ECHOUEE' };
    }

    await this.tontinesService.enregistrerCotisation(
      pending.tontineId,
      pending.userId,
      pending.provider,
      pending.referenceExterne ?? payload?.transaction_id ?? undefined,
      pending.id,
      pending.cycleConcerne ?? undefined,
    );

    return { received: true, statut: 'REUSSIE' };
  }

  private timestampAncien(valeur: unknown): boolean {
    const nombre = Number(valeur);
    if (!Number.isFinite(nombre)) return false;
    const secondes = nombre > 10_000_000_000 ? Math.floor(nombre / 1000) : nombre;
    return Math.abs(Math.floor(Date.now() / 1000) - secondes) > WEBHOOK_MAX_AGE_SECONDS;
  }
}
