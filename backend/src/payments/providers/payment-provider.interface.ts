/**
 * Interface commune que doit respecter chaque provider (Wave, Orange Money,
 * PayTech, PayDunya...). Permet d'ajouter un nouveau moyen de paiement sans
 * toucher au reste du système : il suffit d'implémenter cette interface.
 */
export interface InitiationPaiement {
  /** URL vers laquelle rediriger l'utilisateur (paiement web) ou push USSD déclenché. */
  lienPaiement?: string;
  /** Référence unique côté provider, à conserver pour réconcilier le webhook. */
  referenceExterne: string;
}

export interface PaymentProviderClient {
  /**
   * Initialise un paiement chez le provider pour un montant donné.
   * `referenceInterne` permet de faire le lien lors du webhook.
   */
  initierPaiement(montant: number, telephone: string, referenceInterne: string): Promise<InitiationPaiement>;

  /**
   * Vérifie l'authenticité d'un webhook entrant à partir du corps BRUT reçu et
   * de l'en-tête de signature (HMAC-SHA256 avec comparison à temps constant).
   */
  verifierSignatureWebhook(
    rawBody: string,
    signatureHeader: string | undefined,
    payload?: unknown,
  ): boolean;
}
