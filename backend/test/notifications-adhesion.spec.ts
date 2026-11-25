/**
 * Point 2 — notification d'adhésion cliquable et demande traitée
 * uniquement par le créateur de la tontine.
 *
 * Tests d'intégration sur la BASE DE TEST ISOLÉE (jamais la base de dev) :
 *   DATABASE_URL=postgresql://tontine:tontine@localhost:5433/tontine_saas_test?schema=public npx prisma migrate deploy
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { JourSemaine, PrismaClient, Role } from '@prisma/client';
import { randomInt, randomUUID } from 'crypto';
import { TontinesService } from '../src/tontines/tontines.service';
import { NotificationsService } from '../src/notifications/notifications.service';

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://tontine:tontine@localhost:5433/tontine_saas_test?schema=public';

const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
const notifications = new NotificationsService(prisma as any);
const souscriptions = { peutCreerTontine: jest.fn(async () => true) };
const audit = { log: jest.fn() };
const service = new TontinesService(
  prisma as any,
  souscriptions as any,
  notifications as any,
  audit as any,
);

async function creerUtilisateur(role: Role, prefix: string) {
  const identifiant = randomUUID().slice(0, 8);
  return prisma.user.create({
    data: {
      email: `${prefix}-${identifiant}@example.com`,
      telephone: `+22177${String(randomInt(0, 1e8)).padStart(8, '0')}`,
      passwordHash: 'hash-de-test',
      nom: `Nom${identifiant}`,
      prenom: 'Test',
      role,
      isVerified: true,
    },
  });
}

const dtoCreation = {
  nom: 'Tontine avec notification',
  montantCotisation: 10000,
  jourCotisation: JourSemaine.LUNDI,
  nombreMaxMembres: 3,
} as any;

beforeAll(async () => {
  const parametres = await prisma.parametresPlateforme.findUnique({ where: { cle: 'global' } });
  if (!parametres) {
    throw new Error('Base de test non migrée : lancez prisma migrate deploy sur tontine_saas_test.');
  }
});

beforeEach(async () => {
  jest.clearAllMocks();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "demandes_adhesion", "amendes_retard", "pending_payments", "transactions", "tontine_members", "tontines", "subscriptions", "audit_logs", "notifications", "users" RESTART IDENTITY CASCADE',
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('notification d’adhésion cliquable', () => {
  it('pointe vers la bonne tontine et la bonne demande en attente', async () => {
    const createur = await creerUtilisateur(Role.ADMIN_TONTINE, 'createur');
    const demandeur = await creerUtilisateur(Role.MEMBER, 'demandeur');
    const tontine = await service.creer(createur.id, dtoCreation);

    const reponse = await service.rejoindre(tontine.id, demandeur.id);

    const notification = await prisma.notification.findFirst({
      where: { userId: createur.id, titre: 'Nouvelle demande d’adhésion' },
    });
    expect(notification?.lien).toBe(
      `/admin-tontines?tontineId=${tontine.id}&demandeId=${reponse.demandeId}`,
    );
    expect(notification?.message).toContain(tontine.nom);
  });
});

describe('ouverture et traitement d’une demande', () => {
  it('autorise uniquement le créateur à ouvrir la demande', async () => {
    const createur = await creerUtilisateur(Role.ADMIN_TONTINE, 'createur');
    const autreAdmin = await creerUtilisateur(Role.ADMIN_TONTINE, 'autre-admin');
    const superAdmin = await creerUtilisateur(Role.SUPER_ADMIN, 'super-admin');
    const demandeur = await creerUtilisateur(Role.MEMBER, 'demandeur');
    const tontine = await service.creer(createur.id, dtoCreation);
    await service.rejoindre(tontine.id, demandeur.id);
    const demande = await prisma.demandeAdhesion.findFirst({
      where: { tontineId: tontine.id, userId: demandeur.id },
    });

    const ouverture = await service.lireDemande(demande!.id, createur.id);
    expect(ouverture.dejaTraitee).toBe(false);
    expect(ouverture.message).toMatch(/en attente/);
    expect(ouverture.user.email).toBe(demandeur.email);
    expect(ouverture.tontine.id).toBe(tontine.id);

    await expect(service.lireDemande(demande!.id, autreAdmin.id)).rejects.toThrow(
      /administrateur de cette tontine/,
    );
    await expect(service.lireDemande(demande!.id, superAdmin.id)).rejects.toThrow(
      /administrateur de cette tontine/,
    );
    await expect(service.listerDemandes(tontine.id, superAdmin.id)).rejects.toThrow(
      /administrateur de cette tontine/,
    );
  });

  it('affiche un message clair si la demande est déjà traitée et bloque un second traitement', async () => {
    const createur = await creerUtilisateur(Role.ADMIN_TONTINE, 'createur');
    const autreAdmin = await creerUtilisateur(Role.ADMIN_TONTINE, 'autre-admin');
    const demandeur = await creerUtilisateur(Role.MEMBER, 'demandeur');
    const tontine = await service.creer(createur.id, dtoCreation);
    await service.rejoindre(tontine.id, demandeur.id);
    const demande = await prisma.demandeAdhesion.findFirst({
      where: { tontineId: tontine.id, userId: demandeur.id },
    });

    await service.repondreDemande(demande!.id, createur.id, true);

    const apres = await service.lireDemande(demande!.id, createur.id);
    expect(apres.dejaTraitee).toBe(true);
    expect(apres.statut).toBe('ACCEPTEE');
    expect(apres.message).toMatch(/déjà été acceptée/);

    await expect(service.repondreDemande(demande!.id, createur.id, false)).rejects.toThrow(
      /déjà été acceptée/,
    );
    await expect(service.repondreDemande(demande!.id, autreAdmin.id, true)).rejects.toThrow(
      /administrateur de cette tontine/,
    );
  });
});
