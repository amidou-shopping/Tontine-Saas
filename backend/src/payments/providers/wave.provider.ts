import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PaymentProviderClient, InitiationPaiement } from './payment-provider.interface';
import { verifierHmacSha256 } from './signature.util';

/**
 * Client Wave (Sénégal). Documentation officielle : https://docs.wave.com
 * Le flux réel : POST /v1/checkout/sessions -> renvoie une URL de paiement
 * vers laquelle rediriger l'utilisateur ; Wave notifie ensuite via webhook.
 */
@Injectable()
export class WaveProvider implements PaymentProviderClient {
  private readonly apiKey = process.env.WAVE_API_KEY;
  private readonly webhookSecret = process.env.WAVE_WEBHOOK_SECRET;
  private readonly baseUrl = 'https://api.wave.com/v1';

  async initierPaiement(montant: number, telephone: string, referenceInterne: string): Promise<InitiationPaiement> {
    // Appel réel (à décommenter avec une clé API valide) :
    //
    // const res = await fetch(`${this.baseUrl}/checkout/sessions`, {
    //   method: 'POST',
    //   headers: {
    //     Authorization: `Bearer ${this.apiKey}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     amount: montant,
    //     currency: 'XOF',
    //     client_reference: referenceInterne,
    //     success_url: `${process.env.APP_URL}/paiement/succes`,
    //     error_url: `${process.env.APP_URL}/paiement/echec`,
    //   }),
    // });
    // const data = await res.json();
    // return { lienPaiement: data.wave_launch_url, referenceExterne: data.id };

    // --- SIMULATION MVP (pas de clé API en environnement de dev) ---
    const referenceExterne = `wave_sim_${crypto.randomUUID()}`;
    console.log(`[WAVE SIMULÉ] Paiement de ${montant} FCFA initié pour ${telephone} (ref: ${referenceInterne})`);
    return {
      lienPaiement: `https://pay.wave.com/simulated/${referenceExterne}`,
      referenceExterne,
    };
  }

  verifierSignatureWebhook(rawBody: string, signatureHeader: string | undefined): boolean {
    return verifierHmacSha256(rawBody, signatureHeader, this.webhookSecret);
  }
}
