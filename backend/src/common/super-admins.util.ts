import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';

/**
 * Point 4 — Gouvernance des SUPER_ADMIN.
 *
 * Il n'existe AUCUNE route, aucun DTO et aucun raccourci serveur pour élever
 * un compte en SUPER_ADMIN. La seule voie est le seed ou un script CLI lancé
 * hors du serveur,via `creerSuperAdminDepuisSeedOuCli()`.
 *
 * Le plafond n'est jamais codé en dur : il est porté par ParametresPlateforme
 * (migration 20261124090000_plafond_super_admins) et peut être surchargé par
 * MAX_SUPER_ADMINS. La création est exécutée dans une transaction verrouillée
 * afin que deux créations concurrentes ne puissent jamais dépasser le plafond.
 * Un seul compte peut être principal (index unique partiel en base + contrôle
 * transactionnel ci-dessous).
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

/** Adresse du principal, fournie au seed/CLI par SUPER_ADMIN_PRINCIPAL_EMAIL. */
export function lireEmailPrincipalEnv(): string | undefined {
  return process.env.SUPER_ADMIN_PRINCIPAL_EMAIL?.trim() || undefined;
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

/** Origine autorisée : uniquement un processus seed/CLI, jamais une requête HTTP. */
export type OrigineCreationSuperAdmin = 'SEED' | 'CLI';

/**
 * Crée (ou désigne) un SUPER_ADMIN, uniquement depuis le seed ou un CLI.
 * À appeler IMPÉRATIVEMENT dans une `$transaction` : le verrou advisory
 * sérialise les créations concurrentes pendant toute la transaction.
 *
 * Aucune rétrogradation n'est possible ici : retirer `estPrincipal` à un
 * principal existant est refusé, et le rôle n'est jamais abaissé.
 */
export async function creerSuperAdminDepuisSeedOuCli(
  tx: Prisma.TransactionClient,
  {
    utilisateurId,
    estPrincipal = false,
    origine,
  }: {
    utilisateurId: string;
    estPrincipal?: boolean;
    origine: OrigineCreationSuperAdmin;
  },
): Promise<{ id: string; email: string; role: Role; estPrincipal: boolean }> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('plafond_super_admins'))`;

  const utilisateur = await tx.user.findUnique({
    where: { id: utilisateurId },
    select: { id: true, email: true, role: true, estPrincipal: true },
  });
  if (!utilisateur) throw new NotFoundException('Utilisateur introuvable.');

  if (utilisateur.estPrincipal && !estPrincipal) {
    throw new ConflictException('Le SUPER_ADMIN principal ne peut pas être rétrogradé.');
  }

  if (utilisateur.role !== Role.SUPER_ADMIN) {
    const maximum = await lireNombreMaxSuperAdmins(tx);
    const nombreActuel = await tx.user.count({ where: { role: Role.SUPER_ADMIN } });
    if (nombreActuel >= maximum) {
      throw new ConflictException(
        `Plafond de ${maximum} SUPER_ADMIN atteint : aucune nouvelle création n'est possible.`,
      );
    }
  }

  if (estPrincipal) {
    const principalActuel = await tx.user.findFirst({
      where: { estPrincipal: true },
      select: { id: true, email: true },
    });
    if (principalActuel && principalActuel.id !== utilisateurId) {
      throw new ConflictException(
        `Le SUPER_ADMIN principal est déjà ${principalActuel.email}.`,
      );
    }
  }

  if (utilisateur.role === Role.SUPER_ADMIN && utilisateur.estPrincipal === estPrincipal) {
    return { ...utilisateur }; // idempotent : aucun doublon d'audit
  }

  const misAJour = await tx.user.update({
    where: { id: utilisateurId },
    data: { role: Role.SUPER_ADMIN, estPrincipal },
    select: { id: true, email: true, role: true, estPrincipal: true },
  });

  await tx.auditLog.create({
    data: {
      action: estPrincipal ? 'SUPER_ADMIN_PRINCIPAL_DESIGNE' : 'SUPER_ADMIN_CREE_SEED_CLI',
      cible: misAJour.id,
      acteurId: origine,
      details: JSON.stringify({
        email: misAJour.email,
        role: misAJour.role,
        estPrincipal: misAJour.estPrincipal,
        origine,
      }),
    },
  });

  return misAJour;
}

/**
 * Protège le principal et réserve la suspension/réactivation d'un autre
 * SUPER_ADMIN au principal. Appelé par les seules routes de statut qui
 * existent encore (block/unblock) pour tous les utilisateurs.
 */
export function verifierGestionSuperAdmin(
  cible: { id: string; role: Role; estPrincipal: boolean },
  acteur: { id: string; estPrincipal?: boolean },
  action: 'SUSPENSION' | 'REACTIVATION',
): void {
  if (cible.id === acteur.id) {
    throw new ForbiddenException('Un SUPER_ADMIN ne peut pas modifier son propre statut.');
  }
  if (cible.estPrincipal) {
    throw new ForbiddenException(
      'Le SUPER_ADMIN principal est protégé : il ne peut être ni modifié, ni suspendu, ni rétrogradé, ni supprimé par un autre compte.',
    );
  }
  if (cible.role === Role.SUPER_ADMIN && !acteur.estPrincipal) {
    const verbe = action === 'SUSPENSION' ? 'suspendre' : 'réactiver';
    throw new ForbiddenException(
      `Seul le SUPER_ADMIN principal peut ${verbe} un autre SUPER_ADMIN.`,
    );
  }
}

/**
 * Le compte de démonstration (email et mot de passe connus) ne doit jamais
 * être créé — ni même annoncé dans les logs — en production.
 */
export function peutSeederCompteDemo(environnement: string | undefined): boolean {
  // NODE_ENV non défini est traité comme du développement (cas local courant).
  return environnement === undefined || environnement === 'development';
}
