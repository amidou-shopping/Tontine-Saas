/**
 * Point 1 — le créateur ADMIN_TONTINE est membre d'office de sa tontine.
 *
 * Tests d'intégration sur la BASE DE TEST ISOLÉE (jamais la base de dev) :
 *   DATABASE_URL=postgresql://tontine:tontine@localhost:5433/tontine_saas_test?schema=public npx prisma migrate deploy
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  JourSemaine,
  MemberStatus,
  PaymentProvider,
  PrismaClient,
  Role,
  TontineFrequency,
  TontineStatus,
  TransactionType,
} from '@prisma/client';
import { randomInt, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { TontinesService } from '../src/tontines/tontines.service';

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://tontine:tontine@localhost:5433/tontine_saas_test?schema=public';

const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
const souscriptions = { peutCreerTontine: jest.fn(async () => true) };
const notifications = { creerNotification: jest.fn(), notifierVersement: jest.fn() };
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

/** Tontine « historique » créée sans membre, comme avant le rattrapage. */
async function creerTontineLegacy(
  createurId: string,
  statut: TontineStatus = TontineStatus.EN_ATTENTE,
  cycleActuel = 1,
) {
  return prisma.tontine.create({
    data: {
      nom: `Tontine legacy ${randomUUID().slice(0, 8)}`,
      montantCotisation: 10000,
      frequence: TontineFrequency.HEBDOMADAIRE,
      jourCotisation: JourSemaine.LUNDI,
      nombreMaxMembres: 2,
      tauxCommission: 0.03,
      statut,
      cycleActuel,
      codeInvitation: randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase(),
      createurId,
    },
  });
}

const dtoCreation = {
  nom: 'Tontine du créateur',
  montantCotisation: 10000,
  jourCotisation: JourSemaine.LUNDI,
  nombreMaxMembres: 2,
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

describe('créateur membre d’office', () => {
  it('crée la tontine et le membre ACTIF du créateur dans la même transaction', async () => {
    const createur = await creerUtilisateur(Role.ADMIN_TONTINE, 'createur');

    const tontine = await service.creer(createur.id, dtoCreation);

    const membres = await prisma.tontineMember.findMany({ where: { tontineId: tontine.id } });
    expect(membres).toHaveLength(1);
    expect(membres[0]).toMatchObject({
      userId: createur.id,
      ordrePassage: 1,
      statut: MemberStatus.ACTIF,
      aDejaRecu: false,
    });
    expect(await prisma.tontine.count({ where: { id: tontine.id } })).toBe(1);
    expect(audit.log).toHaveBeenCalledWith(
      'TONTINE_CREEE',
      tontine.id,
      createur.id,
      expect.objectContaining({ nom: tontine.nom }),
    );
  });

  it('refuse au créateur les trois chemins d’adhésion et laisse les autres membres demander', async () => {
    const createur = await creerUtilisateur(Role.ADMIN_TONTINE, 'createur');
    const tontine = await service.creer(createur.id, dtoCreation);

    await expect(service.rejoindre(tontine.id, createur.id)).rejects.toThrow(/créateur/);
    await expect(service.rejoindreParCode(tontine.codeInvitation, createur.id)).rejects.toThrow(
      /créateur/,
    );
    expect(await prisma.demandeAdhesion.count({ where: { tontineId: tontine.id } })).toBe(0);
    expect(notifications.creerNotification).not.toHaveBeenCalled();

    const demandeur = await creerUtilisateur(Role.MEMBER, 'demandeur');
    const reponse = await service.rejoindre(tontine.id, demandeur.id);
    expect(reponse.tontineId).toBe(tontine.id);
    expect(notifications.creerNotification).toHaveBeenCalledWith(
      createur.id,
      'Nouvelle demande d’adhésion',
      expect.stringContaining(tontine.nom),
      'INFO',
      expect.stringContaining(`/admin-tontines?tontineId=${tontine.id}&demandeId=`),
    );
  });

  it('compte dans les membres, participe au tirage, cotise et reçoit son tour', async () => {
    const createur = await creerUtilisateur(Role.ADMIN_TONTINE, 'createur');
    const autre = await creerUtilisateur(Role.MEMBER, 'membre');
    const tontine = await service.creer(createur.id, dtoCreation);
    await service.ajouterMembre(tontine.id, autre.id, createur.id);

    await service.demarrer(tontine.id, createur.id);

    const membres = await prisma.tontineMember.findMany({
      where: { tontineId: tontine.id },
      orderBy: { ordrePassage: 'asc' },
    });
    expect(membres.map((m) => m.userId).sort()).toEqual([createur.id, autre.id].sort());
    expect(membres.map((m) => m.ordrePassage)).toEqual([1, 2]);

    for (let cycle = 1; cycle <= 2; cycle++) {
      for (const userId of [createur.id, autre.id]) {
        await service.enregistrerCotisation(tontine.id, userId, PaymentProvider.WAVE);
      }
    }

    const versementsCreateur = await prisma.transaction.findMany({
      where: {
        tontineId: tontine.id,
        userId: createur.id,
        type: TransactionType.VERSEMENT_GAGNANT,
      },
    });
    expect(versementsCreateur).toHaveLength(1);

    const participationCreateur = membres.find((m) => m.userId === createur.id)!;
    const apres = await prisma.tontineMember.findUnique({
      where: { id: participationCreateur.id },
    });
    expect(apres?.aDejaRecu).toBe(true);
    expect(apres?.dateReception).not.toBeNull();
  });
});

describe('migration de rattrapage', () => {
  it('rattrape les tontines en attente et signale les cycles en cours sans les modifier', async () => {
    const createur = await creerUtilisateur(Role.ADMIN_TONTINE, 'createur');
    const enAttente = await creerTontineLegacy(createur.id, TontineStatus.EN_ATTENTE, 1);
    const enCours = await creerTontineLegacy(createur.id, TontineStatus.ACTIVE, 2);

    const migration = readFileSync(
      join(
        process.cwd(),
        'prisma',
        'migrations',
        '20261125123000_createur_membre_rattrapage',
        'migration.sql',
      ),
      'utf8',
    );
    await prisma.$executeRawUnsafe(migration);

    const rattrapés = await prisma.tontineMember.findMany({ where: { tontineId: enAttente.id } });
    expect(rattrapés).toHaveLength(1);
    expect(rattrapés[0]).toMatchObject({
      userId: createur.id,
      statut: MemberStatus.ACTIF,
    });

    expect(await prisma.tontineMember.count({ where: { tontineId: enCours.id } })).toBe(0);
    const signalement = await prisma.auditLog.findUnique({
      where: { id: `rattrapage-createur-${enCours.id}` },
    });
    expect(signalement?.action).toBe('RATTRAPAGE_CREATEUR_CYCLE_EN_COURS');
    expect(signalement?.details).toContain(enCours.id);
    expect(signalement?.details).toContain('"cycleActuel"');
  });
});
