/**
 * dates.util.ts
 * ----------------------------------------------------------------------------
 * Calculs de dates 100 % UTC : aucun fuseau local, aucun `setDate` sur une
 * date locale (source de bugs classiques autour de minuit et des DST).
 *
 *  - `prochainJour(depuis, jour)` : première occurrence de `jour` à partir de
 *    `depuis` (inclusive si `depuis` est déjà ce jour), à minuit UTC ;
 *  - `dateDuTour(dateDebut, tour)` : dateDebut + (tour - 1) * 7 jours.
 * ----------------------------------------------------------------------------
 */

import { JourSemaine } from '@prisma/client';

const JOUR_MS = 24 * 60 * 60 * 1000;

/** getUTCDay() : 0 = dimanche, 1 = lundi, ... 6 = samedi. */
const NUMERO_JOUR: Record<JourSemaine, number> = {
  LUNDI: 1,
  MARDI: 2,
  MERCREDI: 3,
  JEUDI: 4,
  VENDREDI: 5,
  SAMEDI: 6,
  DIMANCHE: 0,
};

const LIBELLE_JOUR: Record<JourSemaine, string> = {
  LUNDI: 'lundi',
  MARDI: 'mardi',
  MERCREDI: 'mercredi',
  JEUDI: 'jeudi',
  VENDREDI: 'vendredi',
  SAMEDI: 'samedi',
  DIMANCHE: 'dimanche',
};

/** Minuit UTC du jour de `date`. */
export function minuitUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Demain à minuit UTC (référence utilisée au démarrage d'une tontine). */
export function demainUTC(maintenant = new Date()): Date {
  return minuitUTC(new Date(maintenant.getTime() + JOUR_MS));
}

/**
 * Première date (minuit UTC) correspondant à `jour` à partir de `depuis`.
 * Inclusive : si `depuis` est déjà ce jour-là à minuit UTC, elle est retournée.
 */
export function prochainJour(depuis: Date, jour: JourSemaine): Date {
  const cible = NUMERO_JOUR[jour];
  if (cible === undefined) throw new Error('Jour de semaine invalide.');
  const debut = minuitUTC(depuis);
  const ecart = (cible - debut.getUTCDay() + 7) % 7;
  return new Date(debut.getTime() + ecart * JOUR_MS);
}

/** Échéance du tour N : dateDebut + (N - 1) semaines, en UTC. */
export function dateDuTour(dateDebut: Date, tour: number): Date {
  if (!Number.isInteger(tour) || tour < 1) throw new Error('Numéro de tour invalide.');
  return new Date(dateDebut.getTime() + (tour - 1) * 7 * JOUR_MS);
}

/** Ajoute exactement une semaine (UTC), utilisé pour avancer une échéance dépassée. */
export function semaineSuivante(date: Date): Date {
  return new Date(date.getTime() + 7 * JOUR_MS);
}

/** Libellé français du jour (pour les formulaires et notifications). */
export function libelleJour(jour: JourSemaine): string {
  const libelle = LIBELLE_JOUR[jour];
  if (!libelle) throw new Error('Jour de semaine invalide.');
  return libelle;
}
