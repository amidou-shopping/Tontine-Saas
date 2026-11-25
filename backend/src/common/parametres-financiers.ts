/**
 * parametres-financiers.ts
 * ----------------------------------------------------------------------------
 * Source unique des taux et limites financières : la table singleton
 * `ParametresPlateforme`, surchargeable par variables d'environnement.
 *
 * Variables (facultatives, valeurs vides = on garde la valeur de la table) :
 *   TAUX_COMMISSION_PLATEFORME   ex: 0.03
 *   TAUX_AMENDE_RETARD           ex: 0.10
 *   DELAI_GRACE_HEURES           ex: 24
 *   DELAI_AVERTISSEMENT_SUPPRESSION_JOURS  ex: 7 (suppression sécurisée)
 *   FRAIS_PASSAGE_ADMIN                   ex: 1000 (FCFA entiers, passage Admin)
 *
 * Aucun taux n'est codé en dur ici : les valeurs par défaut sont portées par
 * la migration datée, et les tests passent explicitement leurs paramètres.
 * ----------------------------------------------------------------------------
 */

import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ParametresFinanciers } from './finances.util';

function nombreEnv(nom: string): number | undefined {
  const brut = process.env[nom];
  if (brut === undefined || brut.trim() === '') return undefined;
  const valeur = Number(brut);
  if (!Number.isFinite(valeur)) {
    throw new Error(`${nom} doit être un nombre valide.`);
  }
  return valeur;
}

/** Lit les paramètres dans la transaction courante (ou via PrismaService). */
export async function lireParametresFinanciers(
  client: Prisma.TransactionClient | PrismaService,
): Promise<ParametresFinanciers> {
  const parametres = await client.parametresPlateforme.findUnique({
    where: { cle: 'global' },
  });
  if (!parametres) {
    throw new Error(
      'Paramètres financiers introuvables : appliquez la migration 20261123093000_regles_financieres_phase1.',
    );
  }

  return {
    tauxCommission:
      nombreEnv('TAUX_COMMISSION_PLATEFORME') ?? Number(parametres.tauxCommission),
    tauxAmende: nombreEnv('TAUX_AMENDE_RETARD') ?? Number(parametres.tauxAmende),
    delaiGraceHeures:
      nombreEnv('DELAI_GRACE_HEURES') ?? parametres.delaiGraceHeures,
  };
}

/**
 * Délai (en jours) entre l'avertissement du Super-Admin et la suppression
 * effective d'une tontine. La valeur par défaut est portée par la migration ;
 * elle peut être surchargée par variable d'environnement.
 */
export async function lireDelaiAvertissementSuppression(
  client: Prisma.TransactionClient | PrismaService,
): Promise<number> {
  const parametres = await client.parametresPlateforme.findUnique({
    where: { cle: 'global' },
    select: { delaiAvertissementSuppressionJours: true },
  });
  if (!parametres) {
    throw new Error(
      'Paramètres plateforme introuvables : appliquez la migration 20261123093000_regles_financieres_phase1.',
    );
  }
  return nombreEnv('DELAI_AVERTISSEMENT_SUPPRESSION_JOURS') ??
    parametres.delaiAvertissementSuppressionJours;
}

/**
 * Frais uniques de passage MEMBER -> ADMIN_TONTINE. Montant entier en FCFA,
 * lu dans la table singleton et surchargeable par FRAIS_PASSAGE_ADMIN.
 */
export async function lireFraisPassageAdmin(
  client: Prisma.TransactionClient | PrismaService,
): Promise<number> {
  const parametres = await client.parametresPlateforme.findUnique({
    where: { cle: 'global' },
    select: { fraisPassageAdminFcfa: true },
  });
  if (!parametres) {
    throw new Error(
      'Paramètres plateforme introuvables : appliquez la migration 20261125140000_passage_admin_paye.',
    );
  }

  const surcharge = nombreEnv('FRAIS_PASSAGE_ADMIN');
  if (surcharge !== undefined && (!Number.isInteger(surcharge) || surcharge <= 0)) {
    throw new Error('FRAIS_PASSAGE_ADMIN doit être un entier positif (FCFA).');
  }
  return surcharge ?? parametres.fraisPassageAdminFcfa;
}
