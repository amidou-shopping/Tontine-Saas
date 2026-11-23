/**
 * monetization.util.ts
 * ----------------------------------------------------------------------------
 * Logique centrale de monétisation du SaaS :
 *  - Calcul de la commission prélevée sur chaque cotisation.
 *  - Calcul du montant net à verser au bénéficiaire du tour.
 *
 * IMPORTANT : le FCFA n'a pas de sous-unité, donc les montants manipulés ici
 * sont des entiers arrondis au franc. La commission étant enregistrée par
 * cotisation, le total d'un cycle est la somme des commissions unitaires
 * (et non un arrondi global) : la cagnotte correspond aux nets du ledger.
 * ----------------------------------------------------------------------------
 */

export interface ResultatCommission {
  montantBrut: number;       // Montant initial de la cotisation
  tauxCommission: number;    // Taux appliqué (ex: 0.015 pour 1.5%)
  montantCommission: number; // Part prélevée par la plateforme (arrondie)
  montantNet: number;        // Ce qui reste effectivement dans la cagnotte
}

/**
 * Calcule la commission du SaaS sur UNE cotisation individuelle.
 *
 * @param montantBrut     Montant versé par le membre (en FCFA).
 * @param tauxCommission  Taux de commission de la tontine (ex: 0.015 = 1.5%).
 *                        Vient de `tontine.tauxCommission` en base.
 */
export function calculerCommissionCotisation(
  montantBrut: number,
  tauxCommission: number,
): ResultatCommission {
  if (montantBrut <= 0) {
    throw new Error('Le montant de la cotisation doit être strictement positif.');
  }
  if (tauxCommission < 0 || tauxCommission > 0.2) {
    // Garde-fou métier : on refuse un taux aberrant (>20%)
    throw new Error('Taux de commission invalide.');
  }

  const montantCommission = Math.round(montantBrut * tauxCommission);
  const montantNet = montantBrut - montantCommission;

  return {
    montantBrut,
    tauxCommission,
    montantCommission,
    montantNet,
  };
}

export interface ResultatCagnotte {
  nombreCotisants: number;
  montantBrutTotal: number;
  commissionTotale: number;
  montantAVerserAuGagnant: number;
}

/**
 * Agrège l'ensemble des cotisations d'un cycle pour déterminer le montant
 * net à verser au bénéficiaire du tour (le "gagnant" de la rotation).
 *
 * @param montantCotisationUnitaire Montant fixe attendu par membre.
 * @param nombreCotisants           Nombre de membres ayant réellement payé ce cycle.
 * @param tauxCommission            Taux de commission de la tontine.
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
  const montantAVerserAuGagnant = montantBrutTotal - commissionTotale;

  return {
    nombreCotisants,
    montantBrutTotal,
    commissionTotale,
    montantAVerserAuGagnant,
  };
}

/**
 * Exemple d'utilisation dans un service de traitement de cotisation :
 *
 * const { montantCommission, montantNet } = calculerCommissionCotisation(10000, 0.015);
 * // montantCommission = 150 FCFA -> transaction type COMMISSION
 * // montantNet = 9850 FCFA -> crédité à la cagnotte de la tontine
 */
