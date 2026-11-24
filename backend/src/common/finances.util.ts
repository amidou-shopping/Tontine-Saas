/**
 * finances.util.ts
 * ----------------------------------------------------------------------------
 * Règles métier financières pures (aucun accès base, aucun effet de bord) :
 *  - échéance d'un tour (hebdomadaire, calculée en UTC via `dateDuTour`) ;
 *  - délai de grâce configurable ;
 *  - amende de retard égale à un pourcentage de la cotisation DUE, sans
 *    commission, arrondie avec la règle unique `arrondiFCFA` ;
 *  - montant total à régler pour un arriéré.
 *
 * Ces fonctions sont appelées côté serveur, dans la transaction Prisma qui
 * enregistre la cotisation et verrouille la tontine (verrou advisory).
 * ----------------------------------------------------------------------------
 */

import { arrondiFCFA } from './monetization.util';
import { dateDuTour } from './dates.util';

export interface ParametresFinanciers {
  tauxCommission: number;  // ex: 0.03
  tauxAmende: number;      // ex: 0.10
  delaiGraceHeures: number; // ex: 24
}

/** Vrai quand le délai de grâce est écoulé (strictement au-delà). */
export function estApresDelaiGrace(
  dateEcheance: Date,
  maintenant: Date,
  delaiGraceHeures: number,
): boolean {
  if (!Number.isFinite(delaiGraceHeures) || delaiGraceHeures < 0) {
    throw new Error('Délai de grâce invalide.');
  }
  const limite = dateEcheance.getTime() + delaiGraceHeures * 60 * 60 * 1000;
  return maintenant.getTime() > limite;
}

/** Amende de retard : 0 avant le délai de grâce, sinon pourcentage de la cotisation due. */
export function calculerAmendeRetard(
  montantCotisationDue: number,
  tauxAmende: number,
  enRetard: boolean,
): number {
  if (!enRetard) return 0;
  if (!Number.isInteger(montantCotisationDue) || montantCotisationDue <= 0) {
    throw new Error('Montant de cotisation dû invalide.');
  }
  if (!Number.isFinite(tauxAmende) || tauxAmende < 0 || tauxAmende > 0.2) {
    throw new Error('Taux d\'amende invalide.');
  }
  // Aucune commission n'est prélevée sur l'amende : elle est versée intégralement.
  return arrondiFCFA(montantCotisationDue * tauxAmende);
}

export interface CalculArriere {
  cycle: number;
  dateEcheance: Date;
  cotisationDue: number;
  amende: number;
  montantTotal: number; // cotisationDue + amende
}

export function calculerArriere(
  parametres: ParametresFinanciers,
  dateDebut: Date,
  cycleEnRetard: number,
  montantCotisation: number,
  maintenant = new Date(),
): CalculArriere {
  const dateEcheance = dateDuTour(dateDebut, cycleEnRetard);
  const enRetard = estApresDelaiGrace(dateEcheance, maintenant, parametres.delaiGraceHeures);
  const amende = calculerAmendeRetard(montantCotisation, parametres.tauxAmende, enRetard);

  return {
    cycle: cycleEnRetard,
    dateEcheance,
    cotisationDue: montantCotisation,
    amende,
    montantTotal: montantCotisation + amende,
  };
}
