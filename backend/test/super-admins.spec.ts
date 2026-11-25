/**
 * Point 4 — gouvernance verrouillée des SUPER_ADMIN, sur la base de test isolée.
 *
 * Aucune base de développement n'est réinitialisée. Préparation :
 *   DATABASE_URL=postgresql://tontine:tontine@localhost:5433/tontine_saas_test?schema=public npx prisma migrate deploy
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { PaymentProvider, PrismaClient, Role } from '@prisma/client';
import { randomInt, randomUUID } from 'crypto';
import { AuthService } from '../src/auth/auth.service';
import { AdminController } from '../src/admin/admin.controller';
import { MemberController } from '../src/member/member.controller';
import {
  creerSuperAdminDepuisSeedOuCli,
  peutSeederCompteDemo,
} from '../src/common/super-admins.util';
import { InitierPassageAdminDto } from '../src/member/dto/passage-admin.dto';

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://tontine:tontine@localhost:5433/tontine_saas_test?schema=public';

const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
const audit = { log: jest.fn() };
const notifications = { creerNotification: jest.fn(), notifierVersement: jest.fn() };
const adminController = new AdminController(prisma as any, audit as any, notifications as any);
const paiements = {
  initierPassageAdmin: jest.fn(async () => ({ referenceInterne: 'passage-admin-super-test' })),
  confirmerPassageAdmin: jest.fn(async (userId: string) => {
    await prisma.user.update({ where: { id: userId }, data: { role: Role.ADMIN_TONTINE } });
    return { role: Role.ADMIN_TONTINE };
  }),
};
const memberController = new MemberController(
  prisma as any,
  paiements as any,
  {} as any,
  audit as any,
);
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

/** Seul chemin autorisé : seed/CLI, dans une transaction verrouillée. */
async function creerSuperAdmin(prefix: string, estPrincipal = false) {
  const utilisateur = await creerUtilisateur(Role.MEMBER, prefix);
  return prisma.$transaction((tx) =>
    creerSuperAdminDepuisSeedOuCli(tx, {
      utilisateurId: utilisateur.id,
      estPrincipal,
      origine: 'SEED',
    }),
  );
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
  delete process.env.SUPER_ADMIN_PRINCIPAL_EMAIL;
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "demandes_adhesion", "amendes_retard", "pending_payments", "transactions", "tontine_members", "tontines", "subscriptions", "audit_logs", "notifications", "users" RESTART IDENTITY CASCADE',
  );
});

afterAll(async () => {
  delete process.env.MAX_SUPER_ADMINS;
  delete process.env.SUPER_ADMIN_PRINCIPAL_EMAIL;
  await prisma.$disconnect();
});

describe('compte démo (Point 4)', () => {
  it('n’est jamais créé hors développement', () => {
    expect(peutSeederCompteDemo('development')).toBe(true);
    expect(peutSeederCompteDemo(undefined)).toBe(true);
    expect(peutSeederCompteDemo('production')).toBe(false);
    expect(peutSeederCompteDemo('staging')).toBe(false);
  });
});

describe('aucune voie API n’accorde SUPER_ADMIN', () => {
  it('force le rôle MEMBER à l’inscription même avec un champ role injecté', async () => {
    const prefix = randomUUID().slice(0, 8);
    const resultat = await authService.register({
      email: `inscription-${prefix}@example.com`,
      telephone: `+22177${String(randomInt(0, 1e8)).padStart(8, '0')}`,
      password: 'Password123!',
      nom: 'Inscrit',
      prenom: 'Public',
      role: Role.SUPER_ADMIN,
    } as any);

    const cree = await prisma.user.findUnique({ where: { id: resultat.userId } });
    expect(cree?.role).toBe(Role.MEMBER);
  });

  it('ne change le rôle qu’après paiement confirmé, jamais en SUPER_ADMIN', async () => {
    const membre = await creerUtilisateur(Role.MEMBER);
    const req = { user: { id: membre.id } };
    const initiation = await memberController.devenirAdmin(
      { provider: PaymentProvider.WAVE } as any,
      req,
    );
    expect((await prisma.user.findUnique({ where: { id: membre.id } }))?.role).toBe(Role.MEMBER);

    await memberController.confirmerDevenirAdmin(
      { referenceInterne: initiation.referenceInterne } as any,
      req,
    );
    const apres = await prisma.user.findUnique({ where: { id: membre.id } });
    expect(apres?.role).toBe(Role.ADMIN_TONTINE);
    expect(apres?.estPrincipal).toBe(false);
  });

  it('ne expose ni route ni méthode de promotion Super-Admin', async () => {
    expect((adminController as any).promouvoirSuperAdmin).toBeUndefined();
    const methodes = Object.getOwnPropertyNames(AdminController.prototype).map((nom) =>
      Reflect.getMetadata('path', (AdminController.prototype as any)[nom]),
    );
    expect(methodes).not.toContain('users/:id/promouvoir-super-admin');

    // Une action back-office restante (block) ne peut pas élever un rôle.
    const acteur = await creerSuperAdmin('acteur');
    const cible = await creerUtilisateur(Role.MEMBER, 'cible');
    await adminController.blockUser(cible.id, { user: acteur } as any);
    const apres = await prisma.user.findUnique({ where: { id: cible.id } });
    expect(apres?.role).toBe(Role.MEMBER);
    expect(apres?.estPrincipal).toBe(false);
  });

  it('rejette tout champ de statut injecté dans un DTO', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    // forbidNonWhitelisted renvoie un message générique : on vérifie le type
    // d'erreur et le fait qu'aucun des deux champs ne puisse passer le pipe.
    await expect(
      pipe.transform(
        { provider: PaymentProvider.WAVE, estPrincipal: true },
        { type: 'body', metatype: InitierPassageAdminDto } as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform(
        { provider: PaymentProvider.WAVE, role: Role.SUPER_ADMIN },
        { type: 'body', metatype: InitierPassageAdminDto } as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('création seed/CLI plafonnée en transaction', () => {
  it('désigne le principal et trace l’action dans AuditLog', async () => {
    const principal = await creerSuperAdmin('principal', true);

    expect(principal.role).toBe(Role.SUPER_ADMIN);
    expect(principal.estPrincipal).toBe(true);
    const enregistre = await prisma.auditLog.findFirst({
      where: { action: 'SUPER_ADMIN_PRINCIPAL_DESIGNE', cible: principal.id },
    });
    expect(enregistre?.acteurId).toBe('SEED');

    const again = await prisma.$transaction((tx) =>
      creerSuperAdminDepuisSeedOuCli(tx, {
        utilisateurId: principal.id,
        estPrincipal: true,
        origine: 'SEED',
      }),
    );
    expect(again.id).toBe(principal.id);
    expect(await prisma.auditLog.count({ where: { cible: principal.id } })).toBe(1);
  });

  it('refuse la 4e création quand le plafond de 3 est atteint', async () => {
    await creerSuperAdmin('principal', true);
    await creerSuperAdmin('deux');
    await creerSuperAdmin('trois');
    const candidat = await creerUtilisateur(Role.MEMBER, 'candidat');

    await expect(
      prisma.$transaction((tx) =>
        creerSuperAdminDepuisSeedOuCli(tx, {
          utilisateurId: candidat.id,
          origine: 'CLI',
        }),
      ),
    ).rejects.toThrow(/Plafond de 3 SUPER_ADMIN atteint/);
    const apres = await prisma.user.findUnique({ where: { id: candidat.id } });
    expect(apres?.role).toBe(Role.MEMBER);
    expect(await prisma.user.count({ where: { role: Role.SUPER_ADMIN } })).toBe(3);
  });

  it('sérialise deux créations concurrentes : une seule aboutit', async () => {
    await creerSuperAdmin('principal', true);
    await creerSuperAdmin('deux');
    const [candidatA, candidatB] = await Promise.all([
      creerUtilisateur(Role.MEMBER, 'candidatA'),
      creerUtilisateur(Role.MEMBER, 'candidatB'),
    ]);

    const resultats = await Promise.allSettled(
      [candidatA, candidatB].map((candidat) =>
        prisma.$transaction((tx) =>
          creerSuperAdminDepuisSeedOuCli(tx, {
            utilisateurId: candidat.id,
            origine: 'SEED',
          }),
        ),
      ),
    );
    expect(resultats.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(String(resultats.find((r) => r.status === 'rejected')?.reason)).toMatch(/Plafond de 3/);
    expect(await prisma.user.count({ where: { role: Role.SUPER_ADMIN } })).toBe(3);
  });

  it('respecte MAX_SUPER_ADMINS et refuse un second principal', async () => {
    process.env.MAX_SUPER_ADMINS = '1';
    await creerSuperAdmin('principal', true);
    const candidat = await creerUtilisateur(Role.MEMBER, 'candidat');
    await expect(
      prisma.$transaction((tx) =>
        creerSuperAdminDepuisSeedOuCli(tx, {
          utilisateurId: candidat.id,
          origine: 'CLI',
        }),
      ),
    ).rejects.toThrow(/Plafond de 1 SUPER_ADMIN atteint/);

    delete process.env.MAX_SUPER_ADMINS;
    await expect(
      prisma.$transaction((tx) =>
        creerSuperAdminDepuisSeedOuCli(tx, {
          utilisateurId: candidat.id,
          estPrincipal: true,
          origine: 'CLI',
        }),
      ),
    ).rejects.toThrow(/principal est déjà/);
  });
});

describe('protection du principal et suspension des SUPER_ADMIN', () => {
  it('interdit à un autre SUPER_ADMIN de modifier le principal', async () => {
    const principal = await creerSuperAdmin('principal', true);
    const autre = await creerSuperAdmin('autre');
    const req = { user: autre } as any;

    await expect(adminController.blockUser(principal.id, req)).rejects.toThrow(/protégé/);
    await expect(adminController.unblockUser(principal.id, req)).rejects.toThrow(/protégé/);
    const apres = await prisma.user.findUnique({ where: { id: principal.id } });
    expect(apres?.isBlocked).toBe(false);
    expect(apres?.role).toBe(Role.SUPER_ADMIN);
    expect(apres?.estPrincipal).toBe(true);

    await expect(adminController.blockUser(principal.id, { user: principal } as any)).rejects.toThrow(
      /propre statut/,
    );
  });

  it('réserve la suspension/réactivation d’un autre SUPER_ADMIN au principal', async () => {
    const principal = await creerSuperAdmin('principal', true);
    const autre = await creerSuperAdmin('autre');

    await expect(
      adminController.blockUser(autre.id, { user: autre } as any),
    ).rejects.toThrow(/propre statut/);
    await expect(adminController.blockUser(autre.id, { user: principal } as any)).resolves.toEqual(
      expect.objectContaining({ user: expect.objectContaining({ isBlocked: true }) }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      'USER_BLOCKED',
      autre.id,
      principal.id,
      expect.objectContaining({ type: 'SUPER_ADMIN_SUSPENDU' }),
    );

    const membre = await creerUtilisateur(Role.MEMBER, 'membre');
    await expect(adminController.blockUser(membre.id, { user: autre } as any)).resolves.toEqual(
      expect.objectContaining({ user: expect.objectContaining({ isBlocked: true }) }),
    );
  });

  it('ne peut ni rétrograder le principal ni changer son statut via l’API', async () => {
    const principal = await creerSuperAdmin('principal', true);
    const autre = await creerSuperAdmin('autre');
    await adminController.unblockUser(principal.id, { user: principal } as any).catch(() => undefined);

    await expect(
      prisma.$transaction((tx) =>
        creerSuperAdminDepuisSeedOuCli(tx, {
          utilisateurId: principal.id,
          estPrincipal: false,
          origine: 'CLI',
        }),
      ),
    ).rejects.toThrow(/ne peut pas être rétrogradé/);

    const apres = await prisma.user.findUnique({ where: { id: principal.id } });
    expect(apres?.role).toBe(Role.SUPER_ADMIN);
    expect(apres?.estPrincipal).toBe(true);
    expect((adminController as any).demouvrirSuperAdmin).toBeUndefined();
    expect((adminController as any).supprimerUtilisateur).toBeUndefined();
    expect(audit.log).not.toHaveBeenCalledWith(
      'SUPER_ADMIN_PROMU',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    void autre;
  });
});
