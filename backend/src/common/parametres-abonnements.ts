/**
 * parametres-abonnements.ts — Phase 6
 * ----------------------------------------------------------------------------
 * Source unique de la grille tarifaire et des limites d'abonnement.
 *
 * Comme pour les règles financières, les valeurs par défaut sont portées par
 * la migration datée `20261124100000_abonnements_configurables` (table singleton
 * `ParametresPlateforme`) et peuvent être surchargées par variables
 * d'environnement. Aucun prix ni limite n'est codé en dur dans le service.
 *
 * Tous les montants sont des entiers FCFA (jamais de Float).
 * ----------------------------------------------------------------------------
 */

import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const JOUR_MS = 24 * 60 * 60 * 1000;

export interface ParametresAbonnements {
  prixStandardFcfa: number;
  prixPremiumFcfa: number;
  limiteTontinesGratuites: number;
  limiteTontinesStandard: number;
  dureeEssaiJours: number;
  dureeAbonnementJours: number;
}

/** Surcharge éventuelle par variable d'environnement (entier strict). */
function entierEnv(nom: string, minimum: number): number | undefined {
  const brut = process.env[nom];
  if (brut === undefined || brut.trim() === '') return undefined;
  const valeur = Number(brut);
  if (!Number.isInteger(valeur) || valeur < minimum) {
    throw new Error(`${nom} doit être un entier supérieur ou égal à ${minimum}.`);
  }
  return valeur;
}

/** Lit la grille effective (environnement > table singleton). */
export async function lireParametresAbonnements(
  client: Prisma.TransactionClient | PrismaService,
): Promise<ParametresAbonnements> {
  const parametres = await client.parametresPlateforme.findUnique({
    where: { cle: 'global' },
  });
  if (!parametres) {
    throw new Error(
      'Paramètres abonnements introuvables : appliquez la migration 20261124100000_abonnements_configurables.',
    );
  }

  return {
    prixStandardFcfa:
      entierEnv('PRIX_STANDARD_FCFA', 0) ?? parametres.prixStandardFcfa,
    prixPremiumFcfa:
      entierEnv('PRIX_PREMIUM_FCFA', 0) ?? parametres.prixPremiumFcfa,
    limiteTontinesGratuites:
      entierEnv('LIMITE_TONTINES_GRATUITES', 0) ?? parametres.limiteTontinesGratuites,
    limiteTontinesStandard:
      entierEnv('LIMITE_TONTINES_STANDARD', 0) ?? parametres.limiteTontinesStandard,
    dureeEssaiJours:
      entierEnv('DUREE_ESSAI_JOURS', 1) ?? parametres.dureeEssaiJours,
    dureeAbonnementJours:
      entierEnv('DUREE_ABONNEMENT_JOURS', 1) ?? parametres.dureeAbonnementJours,
  };
}

/** Une date de fin passée invalide l'abonnement même si `actif` est vrai. */
export function estAbonnementActif(
  abonnement: { actif: boolean; dateFin: Date | null },
  maintenant = new Date(),
): boolean {
  return (
    abonnement.actif &&
    !(abonnement.dateFin && abonnement.dateFin.getTime() <= maintenant.getTime())
  );
}

/** Ajoute un nombre entier de jours en UTC (aucun setDate local, pas de DST). */
export function ajouterJoursUTC(depuis: Date, jours: number): Date {
  return new Date(depuis.getTime() + jours * JOUR_MS);
}
