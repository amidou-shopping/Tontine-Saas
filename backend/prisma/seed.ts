/**
 * prisma/seed.ts — Génère des données de démonstration :
 * 1 super-admin, 1 admin de tontine, 4 membres, 1 tontine active avec ses membres.
 *
 * Lancer avec : npm run prisma:seed
 */
import { PrismaClient, Role, TontineType, TontineFrequency, TontineStatus, JourSemaine } from '@prisma/client';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcryptjs';
import {
  creerSuperAdminDepuisSeedOuCli,
  lireEmailPrincipalEnv,
  peutSeederCompteDemo,
} from '../src/common/super-admins.util';

const prisma = new PrismaClient();

/** Téléphone unique pour les comptes créés par le seed (évite les collisions). */
function telephoneAleatoire(): string {
  return `+22177${String(randomInt(0, 1e9)).padStart(9, '0')}`;
}

async function main() {
  // Le compte démo a un email et un mot de passe publics : il ne doit jamais
  // être créé (ni annoncé dans les logs) hors environnement de développement.
  if (!peutSeederCompteDemo(process.env.NODE_ENV)) {
    throw new Error(
      'Seed refusé : le compte de démonstration ne peut être créé qu’en développement (jamais en production).',
    );
  }

  const motDePasseHash = await bcrypt.hash('Password123!', 12);

  // Point 4 : le SUPER_ADMIN principal est désigné par
  // SUPER_ADMIN_PRINCIPAL_EMAIL. Fallback démo pour un seed local sans .env.
  // Création transactionnelle : verrou + plafond (3 par défaut) + unicité du
  // principal, exactement comme pour le CLI. Aucune route HTTP ne peut faire
  // cela.
  const emailPrincipal = lireEmailPrincipalEnv() ?? 'admin@tontine.sn';
  const superAdmin = await prisma.$transaction(async (tx) => {
    let compte = await tx.user.findUnique({ where: { email: emailPrincipal } });
    if (!compte) {
      compte = await tx.user.create({
        data: {
          email: emailPrincipal,
          telephone: telephoneAleatoire(),
          passwordHash: motDePasseHash,
          nom: 'Diop',
          prenom: 'Fatou',
          role: Role.MEMBER,
          isVerified: true,
        },
      });
    }
    return creerSuperAdminDepuisSeedOuCli(tx, {
      utilisateurId: compte.id,
      estPrincipal: true,
      origine: 'SEED',
    });
  });

  // SUPER_ADMIN_EMAILS (optionnel) permet de créer les 2 autres comptes max.
  // Le plafond est vérifié dans la transaction de chaque compte.
  const emailsSupplementaires = (process.env.SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0 && email !== superAdmin.email);
  for (const email of emailsSupplementaires) {
    await prisma.$transaction(async (tx) => {
      let compte = await tx.user.findUnique({ where: { email } });
      if (!compte) {
        compte = await tx.user.create({
          data: {
            email,
            telephone: telephoneAleatoire(),
            passwordHash: motDePasseHash,
            nom: 'Admin',
            prenom: 'Plateforme',
            role: Role.MEMBER,
            isVerified: true,
          },
        });
      }
      await creerSuperAdminDepuisSeedOuCli(tx, {
        utilisateurId: compte.id,
        estPrincipal: false,
        origine: 'SEED',
      });
    });
  }

  const creatrice = await prisma.user.upsert({
    where: { email: 'aissatou@example.com' },
    update: {},
    create: {
      email: 'aissatou@example.com',
      telephone: '+221770000002',
      passwordHash: motDePasseHash,
      nom: 'Sow',
      prenom: 'Aissatou',
      role: Role.ADMIN_TONTINE,
      isVerified: true,
    },
  });

  const membres = await Promise.all(
    [
      { email: 'moussa@example.com', telephone: '+221770000003', nom: 'Ndiaye', prenom: 'Moussa' },
      { email: 'khady@example.com', telephone: '+221770000004', nom: 'Fall', prenom: 'Khady' },
      { email: 'ibrahima@example.com', telephone: '+221770000005', nom: 'Ba', prenom: 'Ibrahima' },
    ].map((m) =>
      prisma.user.upsert({
        where: { email: m.email },
        update: {},
        create: { ...m, passwordHash: motDePasseHash, role: Role.MEMBER, isVerified: true },
      }),
    ),
  );

  const tontine = await prisma.tontine.upsert({
    where: { codeInvitation: 'DEMO1234' },
    update: {},
    create: {
      nom: 'Tontine des Amies de Sicap',
      description: 'Tontine hebdomadaire entre voisines du quartier Sicap.',
      type: TontineType.CLASSIQUE,
      montantCotisation: 10000,
      frequence: TontineFrequency.HEBDOMADAIRE,
      jourCotisation: JourSemaine.LUNDI,
      nombreMaxMembres: 4,
      tauxCommission: 0.03,
      statut: TontineStatus.ACTIVE,
      dateDebut: new Date(),
      cycleActuel: 1,
      codeInvitation: 'DEMO1234',
      createurId: creatrice.id,
    },
  });

  await Promise.all(
    [
      { userId: creatrice.id, ordrePassage: 1 },
      { userId: membres[0].id, ordrePassage: 2 },
      { userId: membres[1].id, ordrePassage: 3 },
      { userId: membres[2].id, ordrePassage: 4 },
    ].map((m) =>
      prisma.tontineMember.upsert({
        where: {
          tontineId_userId: { tontineId: tontine.id, userId: m.userId },
        },
        update: {},
        create: {
          tontineId: tontine.id,
          userId: m.userId,
          ordrePassage: m.ordrePassage,
        },
      }),
    ),
  );

  console.log('Seed terminé :');
  console.log(`- Super-admin (développement uniquement) : ${superAdmin.email} / Password123!`);
  console.log(`- Tontine créée : ${tontine.nom} (id: ${tontine.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
