import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';

/**
 * Phase 4 — Gouvernance des SUPER_ADMIN.
 *
 * Le plafond n'est jamais codé en dur : il est porté par ParametresPlateforme
 * (migration 20261124090000_plafond_super_admins) et peut être surchargé par
 * MAX_SUPER_ADMINS. Toutes les promotions (back-office ET seed) passent par la
 * même fonction, exécutée dans une transaction avec verrou advisory, afin
 * qu'aucune promotion concurrente ne puisse dépasser le plafond.
 */

/** Surcharge éventuelle du plafond par variable d'environnement. */
function lirePlafondEnv(): number | null {
  const brut = process.env.MAX_SUPER_ADMINS?.trim();
  if (!brut) return null;
  const nombre = Number(brut);
  if (!Number.isInteger(nombre) || nombre < 1) {
    throw new BadRequestException('MAX_SUPER_ADMINS doit être un entier supérieur à 0.');
  }
  return nombre;
}

/** Plafond effectif : variable d'environnement ou valeur de la table. */
export async function lireNombreMaxSuperAdmins(
  client: Prisma.TransactionClient | { parametresPlateforme: any },
): Promise<number> {
  const parametres = await client.parametresPlateforme.findUnique({
    where: { cle: 'global' },
    select: { nombreMaxSuperAdmins: true },
  });
  if (!parametres) {
    throw new Error(
      'Paramètres plateforme introuvables : appliquez la migration 20261123093000_regles_financieres_phase1.',
    );
  }
  return lirePlafondEnv() ?? parametres.nombreMaxSuperAdmins;
}

/**
 * Promeut un utilisateur au rôle SUPER_ADMIN, sous réserve du plafond.
 * À appeler IMPÉRATIVEMENT dans une `$transaction` : le verrou advisory
 * sérialise les promotions concurrentes pendant toute la transaction.
 */
export async function promouvoirSuperAdminDansTransaction(
  tx: Prisma.TransactionClient,
  utilisateurId: string,
): Promise<{ id: string; email: string; role: Role }> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('plafond_super_admins'))`;

  const utilisateur = await tx.user.findUnique({
    where: { id: utilisateurId },
    select: { id: true, email: true, role: true },
  });
  if (!utilisateur) throw new NotFoundException('Utilisateur introuvable.');
  if (utilisateur.role === Role.SUPER_ADMIN) {
    throw new ConflictException('Cet utilisateur est déjà SUPER_ADMIN.');
  }

  const maximum = await lireNombreMaxSuperAdmins(tx);
  const nombreActuel = await tx.user.count({ where: { role: Role.SUPER_ADMIN } });
  if (nombreActuel >= maximum) {
    throw new ConflictException(
      `Plafond de ${maximum} SUPER_ADMIN atteint : aucune nouvelle promotion n'est possible.`,
    );
  }

  return tx.user.update({
    where: { id: utilisateurId },
    data: { role: Role.SUPER_ADMIN },
    select: { id: true, email: true, role: true },
  });
}

/**
 * Le compte de démonstration (email et mot de passe connus) ne doit jamais
 * être créé — ni même annoncé dans les logs — en production.
 */
export function peutSeederCompteDemo(environnement: string | undefined): boolean {
  // NODE_ENV non défini est traité comme du développement (cas local courant).
  return environnement === undefined || environnement === 'development';
}
