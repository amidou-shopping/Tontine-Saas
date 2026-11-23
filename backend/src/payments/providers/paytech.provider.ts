import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PaymentProviderClient, InitiationPaiement } from './payment-provider.interface';
import { verifierHmacSha256 } from './signature.util';

/**
 * Client PayTech (https://paytech.sn) — agrégateur qui expose Wave, Orange
 * Money, Free Money etc. derrière une seule API. Utile comme fallback ou
 * pour simplifier l'intégration initiale plutôt que gérer chaque wallet
 * directement.
 */
@Injectable()
export class PaytechProvider implements PaymentProviderClient {
  private readonly apiKey = process.env.PAYTECH_API_KEY;
  private readonly apiSecret = process.env.PAYTECH_API_SECRET;
  private readonly baseUrl = 'https://paytech.sn/api';

  async initierPaiement(montant: number, telephone: string, referenceInterne: string): Promise<InitiationPaiement> {
    // Appel réel :
    // POST {baseUrl}/payment/request-payment
    // headers: { API_KEY, API_SECRET }
    // body: { item_name, item_price: montant, currency: 'XOF', ref_command: referenceInterne, ... }
    // -> renvoie { token, redirect_url }

    // --- SIMULATION MVP ---
    const referenceExterne = `paytech_sim_${crypto.randomUUID()}`;
    console.log(`[PAYTECH SIMULÉ] Paiement de ${montant} FCFA initié pour ${telephone} (ref: ${referenceInterne})`);
    return {
      lienPaiement: `https://paytech.sn/payment/simulated/${referenceExterne}`,
      referenceExterne,
    };
  }

  verifierSignatureWebhook(
    rawBody: string,
    signatureHeader: string | undefined,
    payload?: unknown,
  ): boolean {
    // Les champs api_key_sha256 / api_secret_sha256 historiques ne suffisent pas
    // (rejouables) : ils sont conservés comme contrôle complémentaire, jamais
    // comme unique preuve. La signature HMAC du corps brut est obligatoire.
    const corps = payload as { api_key_sha256?: string } | undefined;
    if (corps?.api_key_sha256) {
      const apiKeyHash = crypto.createHash('sha256').update(this.apiKey ?? '').digest('hex');
      if (corps.api_key_sha256 !== apiKeyHash) return false;
    }
    return verifierHmacSha256(rawBody, signatureHeader, this.apiSecret);
  }
}
