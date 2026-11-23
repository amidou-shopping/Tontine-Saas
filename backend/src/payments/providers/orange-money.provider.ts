import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PaymentProviderClient, InitiationPaiement } from './payment-provider.interface';
import { verifierHmacSha256 } from './signature.util';

/**
 * Client Orange Money (API Orange Developer / Orange Money Web Payment).
 * Flux réel : obtention d'un token OAuth2, puis création d'une transaction
 * de paiement qui renvoie une URL de confirmation (paiement via code USSD/PIN).
 */
@Injectable()
export class OrangeMoneyProvider implements PaymentProviderClient {
  private readonly clientId = process.env.ORANGE_MONEY_CLIENT_ID;
  private readonly clientSecret = process.env.ORANGE_MONEY_CLIENT_SECRET;
  private readonly webhookSecret = process.env.ORANGE_MONEY_WEBHOOK_SECRET;

  async initierPaiement(montant: number, telephone: string, referenceInterne: string): Promise<InitiationPaiement> {
    // Appel réel :
    // 1. POST https://api.orange.com/oauth/v3/token (client_credentials) -> access_token
    // 2. POST https://api.orange.com/orange-money-webpay/{pays}/v1/webpayment
    //    body: { merchant_key, currency: 'OUV', order_id: referenceInterne, amount: montant, ... }
    //    -> renvoie payment_url + pay_token

    // --- SIMULATION MVP ---
    const referenceExterne = `om_sim_${crypto.randomUUID()}`;
    console.log(`[ORANGE MONEY SIMULÉ] Paiement de ${montant} FCFA initié pour ${telephone} (ref: ${referenceInterne})`);
    return {
      lienPaiement: `https://webpayment.orange-money.com/simulated/${referenceExterne}`,
      referenceExterne,
    };
  }

  verifierSignatureWebhook(rawBody: string, signatureHeader: string | undefined): boolean {
    return verifierHmacSha256(rawBody, signatureHeader, this.webhookSecret);
  }
}
