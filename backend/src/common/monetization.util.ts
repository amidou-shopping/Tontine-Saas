/**
 * monetization.util.ts
 * ----------------------------------------------------------------------------
 * Calculs financiers du SaaS, tous en FCFA entiers.
 *
 * RÈGLE D'ARRONDI UNIQUE : toute commission (et toute amende) est arrondie
 * à l'entier inférieur (Math.floor). Le taux vient de la configuration
 * (ParametresPlateforme, éventuellement surchargée par l'environnement),
 * jamais d'une constante métier codée dans ce fichier.
 *
 * La commission est enregistrée PAR COTISATION : le total d'un cycle est la
 * somme des commissions unitaires, pas un arrondi sur le total global.
 * ----------------------------------------------------------------------------
 */

export interface ResultatCommission {
  montantBrut: number;       // Montant initial de la cotisation
  tauxCommission: number;    // Taux appliqué (ex: 0.03 pour 3%)
  montantCommission: number; // Part prélevée par la plateforme (entier)
  montantNet: number;        // Ce qui reste effectivement dans la cagnotte
}

/** Arrondi à l'entier inférieur, utilisé par TOUS les calculs financiers. */
export function arrondiFCFA(montant: number): number {
  if (!Number.isFinite(montant) || montant < 0) {
    throw new Error('Montant FCFA invalide.');
  }
  return Math.floor(montant);
}

/**
 * Calcule la commission du SaaS sur UNE cotisation individuelle.
 * Aucune commission n'est prélevée sur une amende ni sur un versement.
 */
export function calculerCommissionCotisation(
  montantBrut: number,
  tauxCommission: number,
): ResultatCommission {
  if (!Number.isInteger(montantBrut) || montantBrut <= 0) {
    throw new Error('Le montant de la cotisation doit être un entier FCFA strictement positif.');
  }
  if (!Number.isFinite(tauxCommission) || tauxCommission < 0 || tauxCommission > 0.2) {
    // Garde-fou : on refuse un taux aberrant (> 20%).
    throw new Error('Taux de commission invalide.');
  }

  const montantCommission = arrondiFCFA(montantBrut * tauxCommission);
  const montantNet = montantBrut - montantCommission;

  return { montantBrut, tauxCommission, montantCommission, montantNet };
}

export interface ResultatCagnotte {
  nombreCotisants: number;
  montantBrutTotal: number;
  commissionTotale: number;
  montantAVerserAuGagnant: number;
}

/**
 * Agrège les cotisations d'un cycle pour déterminer le montant net à verser.
 * Les amendes sont ajoutées séparément par le service (voir TontinesService).
 */
export function calculerRepartitionCagnotte(
  montantCotisationUnitaire: number,
  nombreCotisants: number,
  tauxCommission: number,
): ResultatCagnotte {
  if (nombreCotisants <= 0) {
    throw new Error('Aucun cotisant : impossible de calculer la cagnotte.');
  }

  const commissionUnitaire = calculerCommissionCotisation(
    montantCotisationUnitaire,
    tauxCommission,
  ).montantCommission;

  const montantBrutTotal = montantCotisationUnitaire * nombreCotisants;
  const commissionTotale = commissionUnitaire * nombreCotisants;

  return {
    nombreCotisants,
    montantBrutTotal,
    commissionTotale,
    montantAVerserAuGagnant: montantBrutTotal - commissionTotale,
  };
}
