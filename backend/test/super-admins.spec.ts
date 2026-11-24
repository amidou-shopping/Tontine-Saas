/**
 * Tests de la Phase 4 (gouvernance des SUPER_ADMIN) sur la base de test isolée.
 *
 * Aucune base de développement n'est réinitialisée. Préparation :
 *   DATABASE_URL=postgresql://tontine:tontine@localhost:5433/tontine_saas_test?schema=public npx prisma migrate deploy
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PrismaClient, Role } from '@prisma/client';
import { randomInt, randomUUID } from 'crypto';
import { AuthService } from '../src/auth/auth.service';
import { AdminController } from '../src/admin/admin.controller';
import { MemberController } from '../src/member/member.controller';
import { peutSeederCompteDemo } from '../src/common/super-admins.util';

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://tontine:tontine@localhost:5433/tontine_saas_test?schema=public';

const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
const audit = { log: jest.fn() };
const notifications = { creerNotification: jest.fn(), notifierVersement: jest.fn() };
const adminController = new AdminController(prisma as any, audit as any, notifications as any);
const memberController = new MemberController(prisma as any, {} as any, {} as any, audit as any);
const authService = new AuthService(
  prisma as any,
  { sign: jest.fn(() => 'token-de-test') } as any,
  { setex: jest.fn(), get: jest.fn(), incr: jest.fn(), expire: jest.fn(), del: jest.fn() } as any,
  { envoyerCodeVerification: jest.fn() } as any,
);

async function creerUtilisateur(role: Role, prefix = 'phase4') {
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

beforeAll(async () => {
  const parametres = await prisma.parametresPlateforme.findUnique({ where: { cle: 'global' } });
  if (!parametres) {
    throw new Error('Base de test non migrée : lancez prisma migrate deploy sur tontine_saas_test.');
  }
});

beforeEach(async () => {
  jest.clearAllMocks();
  delete process.env.MAX_SUPER_ADMINS;
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "demandes_adhesion", "amendes_retard", "pending_payments", "transactions", "tontine_members", "tontines", "subscriptions", "audit_logs", "notifications", "users" RESTART IDENTITY CASCADE',
  );
});

afterAll(async () => {
  delete process.env.MAX_SUPER_ADMINS;
  await prisma.$disconnect();
});

describe('compte démo (Phase 4)', () => {
  it('n’est jamais créé hors développement', () => {
    expect(peutSeederCompteDemo('development')).toBe(true);
    expect(peutSeederCompteDemo(undefined)).toBe(true); // cas local sans NODE_ENV
    expect(peutSeederCompteDemo('production')).toBe(false);
    expect(peutSeederCompteDemo('staging')).toBe(false);
  });
});

describe('aucune route publique n’accorde SUPER_ADMIN (Phase 4)', () => {
  it('force le rôle MEMBER à l’inscription même avec un champ role injecté', async () => {
    const prefix = randomUUID().slice(0, 8);
    const resultat = await authService.register({
      email: `inscription-${prefix}@example.com`,
      telephone: `+22177${String(randomInt(0, 1e8)).padStart(8, '0')}`,
      password: 'Password123!',
      nom: 'Inscrit',
      prenom: 'Public',
      role: Role.SUPER_ADMIN, // tentative d'élévation via le payload
    } as any);

    const cree = await prisma.user.findUnique({ where: { id: resultat.userId } });
    expect(cree?.role).toBe(Role.MEMBER);
  });

  it('limite « devenir admin » au rôle ADMIN_TONTINE', async () => {
    const membre = await creerUtilisateur(Role.MEMBER);
    const resultat = await memberController.devenirAdmin({ user: { id: membre.id } });

    expect(resultat.role).toBe(Role.ADMIN_TONTINE);
    const apres = await prisma.user.findUnique({ where: { id: membre.id } });
    expect(apres?.role).not.toBe(Role.SUPER_ADMIN);
  });
});

describe('promotion Super-Admin plafonnée en transaction (Phase 4)', () => {
  const acteur = { user: { id: 'super-admin-acteur' } };

  it('promeut un administrateur et trace l’action', async () => {
    const candidat = await creerUtilisateur(Role.ADMIN_TONTINE, 'candidat');
    const resultat = await adminController.promouvoirSuperAdmin(candidat.id, acteur);

    expect(resultat.user.role).toBe(Role.SUPER_ADMIN);
    const apres = await prisma.user.findUnique({ where: { id: candidat.id } });
    expect(apres?.role).toBe(Role.SUPER_ADMIN);
    expect(audit.log).toHaveBeenCalledWith('SUPER_ADMIN_PROMU', candidat.id, acteur.user.id, {
      email: candidat.email,
      role: Role.SUPER_ADMIN,
    });

    await expect(adminController.promouvoirSuperAdmin(candidat.id, acteur)).rejects.toThrow(
      /déjà SUPER_ADMIN/,
    );
  });

  it('refuse la 4e promotion lorsque le plafond de 3 est atteint', async () => {
    await Promise.all([1, 2, 3].map((i) => creerUtilisateur(Role.SUPER_ADMIN, `existing${i}`)));
    const candidat = await creerUtilisateur(Role.ADMIN_TONTINE, 'candidat');

    await expect(adminController.promouvoirSuperAdmin(candidat.id, acteur)).rejects.toThrow(
      /Plafond de 3 SUPER_ADMIN atteint/,
    );
    const apres = await prisma.user.findUnique({ where: { id: candidat.id } });
    expect(apres?.role).toBe(Role.ADMIN_TONTINE);
    expect(await prisma.user.count({ where: { role: Role.SUPER_ADMIN } })).toBe(3);
  });

  it('sérialise deux promotions concurrentes : une seule aboutit', async () => {
    // Il ne reste qu'une place (plafond 3) : sans le verrou advisory, les deux
    // transactions compteraient 2 et promouvraient toutes les deux (race).
    await Promise.all([1, 2].map((i) => creerUtilisateur(Role.SUPER_ADMIN, `existing${i}`)));
    const [candidatA, candidatB] = await Promise.all([
      creerUtilisateur(Role.ADMIN_TONTINE, 'candidatA'),
      creerUtilisateur(Role.ADMIN_TONTINE, 'candidatB'),
    ]);

    const resultats = await Promise.allSettled([
      adminController.promouvoirSuperAdmin(candidatA.id, acteur),
      adminController.promouvoirSuperAdmin(candidatB.id, acteur),
    ]);

    expect(resultats.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejet = resultats.find((r) => r.status === 'rejected');
    expect(rejet?.status === 'rejected' && String(rejet.reason)).toMatch(/Plafond de 3/);
    expect(await prisma.user.count({ where: { role: Role.SUPER_ADMIN } })).toBe(3);
  });

  it('respecte la surcharge MAX_SUPER_ADMINS si elle est définie', async () => {
    process.env.MAX_SUPER_ADMINS = '1';
    await creerUtilisateur(Role.SUPER_ADMIN, 'existing');
    const candidat = await creerUtilisateur(Role.ADMIN_TONTINE, 'candidat');

    await expect(adminController.promouvoirSuperAdmin(candidat.id, acteur)).rejects.toThrow(
      /Plafond de 1 SUPER_ADMIN atteint/,
    );
  });
});
