/**
 * CLI de création des SUPER_ADMIN (hors serveur, jamais via l'API).
 *
 *   npm run super-admin:creer -- admin@exemple.com        # principal si l'email = SUPER_ADMIN_PRINCIPAL_EMAIL
 *   npm run super-admin:creer -- autre@exemple.com        # SUPER_ADMIN non principal
 *   npm run super-admin:creer -- autre@exemple.com --principal
 *
 * Variables : SUPER_ADMIN_PASSWORD (mot de passe du compte créé),
 * SUPER_ADMIN_PRINCIPAL_EMAIL, MAX_SUPER_ADMINS (optionnel, défaut 3).
 * Plafond, unicité du principal et audit sont vérifiés dans la transaction.
 */
import { PrismaClient, Role } from '@prisma/client';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcryptjs';
import {
  creerSuperAdminDepuisSeedOuCli,
  lireEmailPrincipalEnv,
} from '../common/super-admins.util';

const prisma = new PrismaClient();

async function main() {
  const emailPrincipal = lireEmailPrincipalEnv();
  const email = process.argv[2]?.trim().toLowerCase() || emailPrincipal;
  if (!email) {
    throw new Error(
      'Email requis : npm run super-admin:creer -- admin@exemple.com (ou définir SUPER_ADMIN_PRINCIPAL_EMAIL).',
    );
  }

  const motDePasse = process.env.SUPER_ADMIN_PASSWORD?.trim();
  if (!motDePasse) {
    throw new Error('SUPER_ADMIN_PASSWORD doit être défini pour créer un SUPER_ADMIN.');
  }

  const estPrincipal =
    process.argv.includes('--principal') || email === emailPrincipal?.toLowerCase();
  const motDePasseHash = await bcrypt.hash(motDePasse, 12);

  const resultat = await prisma.$transaction(async (tx) => {
    let compte = await tx.user.findUnique({ where: { email } });
    if (!compte) {
      compte = await tx.user.create({
        data: {
          email,
          telephone: `+22177${String(randomInt(0, 1e9)).padStart(9, '0')}`,
          passwordHash: motDePasseHash,
          nom: 'Admin',
          prenom: 'Plateforme',
          role: Role.MEMBER,
          isVerified: true,
        },
      });
    }
    return creerSuperAdminDepuisSeedOuCli(tx, {
      utilisateurId: compte.id,
      estPrincipal,
      origine: 'CLI',
    });
  });

  console.log(`SUPER_ADMIN ${estPrincipal ? 'principal ' : ''}créé : ${resultat.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
