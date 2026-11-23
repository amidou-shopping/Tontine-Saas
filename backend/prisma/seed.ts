/**
 * prisma/seed.ts — Génère des données de démonstration :
 * 1 super-admin, 1 admin de tontine, 4 membres, 1 tontine active avec ses membres.
 *
 * Lancer avec : npm run prisma:seed
 */
import { PrismaClient, Role, TontineType, TontineFrequency, TontineStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const motDePasseHash = await bcrypt.hash('Password123!', 12);

  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@tontine.sn' },
    update: {},
    create: {
      email: 'admin@tontine.sn',
      telephone: '+221770000001',
      passwordHash: motDePasseHash,
      nom: 'Diop',
      prenom: 'Fatou',
      role: Role.SUPER_ADMIN,
      isVerified: true,
    },
  });

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
      description: 'Tontine mensuelle entre voisines du quartier Sicap.',
      type: TontineType.CLASSIQUE,
      montantCotisation: 10000,
      frequence: TontineFrequency.MENSUELLE,
      nombreMaxMembres: 4,
      tauxCommission: 0.015,
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
  console.log(`- Super-admin : ${superAdmin.email} / Password123!`);
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
