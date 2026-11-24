/**
 * Tests de la Phase 6 (abonnements configurables, essai, expiration,
 * paiements simulés) sur la base de test isolée tontine_saas_test.
 *
 * Aucune base de développement n'est réinitialisée. Préparation :
 *   DATABASE_URL=postgresql://tontine:tontine@localhost:5433/tontine_saas_test?schema=public npx prisma migrate deploy
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  JourSemaine,
  PlanAbonnement,
  PrismaClient,
  Role,
  TontineFrequency,
  TontineStatus,
  TransactionType,
} from '@prisma/client';
import { randomInt, randomUUID } from 'crypto';
import { SubscriptionsService } from '../src/subscriptions/subscriptions.service';
import { lireParametresAbonnements } from '../src/common/parametres-abonnements';

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://tontine:tontine@localhost:5433/tontine_saas_test?schema=public';

const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
const audit = { log: jest.fn() };
const service = new SubscriptionsService(prisma as any, audit as any);

const CLES_ENV = [
  'PRIX_STANDARD_FCFA',
  'PRIX_PREMIUM_FCFA',
  'LIMITE_TONTINES_GRATUITES',
  'LIMITE_TONTINES_STANDARD',
  'DUREE_ESSAI_JOURS',
  'DUREE_ABONNEMENT_JOURS',
];

const JOUR_MS = 24 * 60 * 60 * 1000;

async function creerUtilisateur(role: Role) {
  const identifiant = randomUUID().slice(0, 8);
  return prisma.user.create({
    data: {
      email: `abo-${identifiant}@example.com`,
      telephone: `+22177${String(randomInt(0, 1e8)).padStart(8, '0')}`,
      passwordHash: 'hash-de-test',
      nom: `Nom${identifiant}`,
      prenom: 'Test',
      role,
      isVerified: true,
    },
  });
}

async function creerTontine(createurId: string) {
  const prefix = randomUUID().slice(0, 8);
  return prisma.tontine.create({
    data: {
      nom: `Tontine abonnement ${prefix}`,
      montantCotisation: 10000,
      frequence: TontineFrequency.HEBDOMADAIRE,
      jourCotisation: JourSemaine.LUNDI,
      nombreMaxMembres: 2,
      tauxCommission: 0.03,
      statut: TontineStatus.EN_ATTENTE,
      dateDebut: new Date(Date.now() + JOUR_MS),
      cycleActuel: 1,
      codeInvitation: randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase(),
      createurId,
    },
  });
}

function dateAEnviron(date: Date | null, jours: number): boolean {
  if (!date) return false;
  return Math.abs(date.getTime() - (Date.now() + jours * JOUR_MS)) < 60_000;
}

beforeAll(async () => {
  const parametres = await prisma.parametresPlateforme.findUnique({ where: { cle: 'global' } });
  if (!parametres) {
    throw new Error('Base de test non migrée : lancez prisma migrate deploy sur tontine_saas_test.');
  }
});

beforeEach(async () => {
  jest.clearAllMocks();
  for (const cle of CLES_ENV) delete process.env[cle];
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "demandes_adhesion", "amendes_retard", "pending_payments", "transactions", "tontine_members", "tontines", "subscriptions", "audit_logs", "notifications", "users" RESTART IDENTITY CASCADE',
  );
});

afterAll(async () => {
  for (const cle of CLES_ENV) delete process.env[cle];
  await prisma.$disconnect();
});

describe('grille configurable (Phase 6)', () => {
  it('lit les valeurs par défaut portées par la migration', async () => {
    expect(await lireParametresAbonnements(prisma as any)).toMatchObject({
      prixStandardFcfa: 5000,
      prixPremiumFcfa: 15000,
      limiteTontinesGratuites: 1,
      limiteTontinesStandard: 5,
      dureeEssaiJours: 14,
      dureeAbonnementJours: 30,
    });
  });

  it('applique les surcharges d’environnement (entiers) et refuse un prix décimal', async () => {
    process.env.PRIX_STANDARD_FCFA = '7000';
    process.env.LIMITE_TONTINES_GRATUITES = '3';
    process.env.DUREE_ESSAI_JOURS = '5';
    const surcharge = await lireParametresAbonnements(prisma as any);
    expect(surcharge.prixStandardFcfa).toBe(7000);
    expect(surcharge.limiteTontinesGratuites).toBe(3);
    expect(surcharge.dureeEssaiJours).toBe(5);
    expect(surcharge.prixPremiumFcfa).toBe(15000); // non surchargé

    process.env.PRIX_STANDARD_FCFA = '7000.5';
    await expect(lireParametresAbonnements(prisma as any)).rejects.toThrow(/entier/);
  });

  it('expose la grille effective via le service (route /subscriptions/plans)', async () => {
    process.env.PRIX_PREMIUM_FCFA = '18000';
    expect(await service.getGrille()).toMatchObject({
      prixStandardFcfa: 5000,
      prixPremiumFcfa: 18000,
      dureeAbonnementJours: 30,
    });
  });
});

describe('changement de plan et période d’essai (Phase 6)', () => {
  it('offre un essai gratuit sans aucun paiement au premier plan payant', async () => {
    const utilisateur = await creerUtilisateur(Role.ADMIN_TONTINE);
    const abonnement = await service.changerPlan(
      utilisateur.id,
      PlanAbonnement.STANDARD,
      Role.ADMIN_TONTINE,
    );

    expect(abonnement).toMatchObject({
      plan: PlanAbonnement.STANDARD,
      prixMensuel: 0,
      actif: true,
      enEssai: true,
    });
    expect(dateAEnviron(abonnement.dateFin, 14)).toBe(true);
    expect(
      await prisma.transaction.count({
        where: { userId: utilisateur.id, type: TransactionType.ABONNEMENT },
      }),
    ).toBe(0);
  });

  it('prélève un paiement simulé entier après l’essai, valable 30 jours', async () => {
    const utilisateur = await creerUtilisateur(Role.ADMIN_TONTINE);
    await service.changerPlan(utilisateur.id, PlanAbonnement.STANDARD, Role.ADMIN_TONTINE);
    const abonnement = await service.changerPlan(
      utilisateur.id,
      PlanAbonnement.STANDARD,
      Role.ADMIN_TONTINE,
    );

    expect(abonnement).toMatchObject({
      prixMensuel: 5000,
      actif: true,
      enEssai: false,
    });
    expect(dateAEnviron(abonnement.dateFin, 30)).toBe(true);
    const transactions = await prisma.transaction.findMany({
      where: { userId: utilisateur.id, type: TransactionType.ABONNEMENT },
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].montantBrut.toNumber()).toBe(5000);
    expect(transactions[0].referenceExterne).toMatch(/^abon_sim_/);
  });

  it('n’offre qu’un seul essai, même en changeant de plan payant', async () => {
    const utilisateur = await creerUtilisateur(Role.ADMIN_TONTINE);
    await service.changerPlan(utilisateur.id, PlanAbonnement.STANDARD, Role.ADMIN_TONTINE);
    const premium = await service.changerPlan(
      utilisateur.id,
      PlanAbonnement.PREMIUM,
      Role.ADMIN_TONTINE,
    );

    expect(premium.enEssai).toBe(false);
    expect(premium.prixMensuel).toBe(15000);
    expect(
      await prisma.transaction.count({
        where: { userId: utilisateur.id, type: TransactionType.ABONNEMENT },
      }),
    ).toBe(1);
  });

  it('sérialise deux changements concurrents : un seul essai au maximum', async () => {
    const utilisateur = await creerUtilisateur(Role.ADMIN_TONTINE);
    await Promise.all([
      service.changerPlan(utilisateur.id, PlanAbonnement.STANDARD, Role.ADMIN_TONTINE),
      service.changerPlan(utilisateur.id, PlanAbonnement.PREMIUM, Role.ADMIN_TONTINE),
    ]);

    expect(
      await prisma.transaction.count({
        where: { userId: utilisateur.id, type: TransactionType.ABONNEMENT },
      }),
    ).toBe(1);
    const enregistre = await prisma.subscription.findUnique({ where: { userId: utilisateur.id } });
    expect(enregistre?.aUtiliseEssai).toBe(true);
    expect(enregistre?.enEssai).toBe(false);
  });

  it('interdit à un MEMBER de souscrire', async () => {
    const membre = await creerUtilisateur(Role.MEMBER);
    await expect(
      service.changerPlan(membre.id, PlanAbonnement.STANDARD, Role.MEMBER),
    ).rejects.toThrow(/administrateurs/);
  });
});

describe('expiration et limites de création (Phase 6)', () => {
  it('bloque la création après expiration, même si actif est vrai', async () => {
    const utilisateur = await creerUtilisateur(Role.ADMIN_TONTINE);
    await prisma.subscription.create({
      data: {
        userId: utilisateur.id,
        plan: PlanAbonnement.STANDARD,
        prixMensuel: 5000,
        actif: true,
        dateFin: new Date(Date.now() - JOUR_MS),
      },
    });

    expect(await service.peutCreerTontine(utilisateur.id)).toBe(false);
    expect((await service.getAbonnement(utilisateur.id)).actif).toBe(false);
  });

  it('applique la limite configurée du plan STANDARD', async () => {
    process.env.LIMITE_TONTINES_STANDARD = '2';
    const utilisateur = await creerUtilisateur(Role.ADMIN_TONTINE);
    await prisma.subscription.create({
      data: {
        userId: utilisateur.id,
        plan: PlanAbonnement.STANDARD,
        prixMensuel: 5000,
        actif: true,
      },
    });
    expect(await service.peutCreerTontine(utilisateur.id)).toBe(true);

    await creerTontine(utilisateur.id);
    expect(await service.peutCreerTontine(utilisateur.id)).toBe(true);
    await creerTontine(utilisateur.id);
    expect(await service.peutCreerTontine(utilisateur.id)).toBe(false);
  });

  it('limite le plan gratuit à une tontine par défaut', async () => {
    const utilisateur = await creerUtilisateur(Role.ADMIN_TONTINE);
    await prisma.subscription.create({
      data: { userId: utilisateur.id, plan: PlanAbonnement.GRATUIT, prixMensuel: 0, actif: true },
    });

    expect(await service.peutCreerTontine(utilisateur.id)).toBe(true);
    await creerTontine(utilisateur.id);
    expect(await service.peutCreerTontine(utilisateur.id)).toBe(false);
  });

  it('laisse le plan PREMIUM illimité', async () => {
    process.env.LIMITE_TONTINES_STANDARD = '1';
    const utilisateur = await creerUtilisateur(Role.ADMIN_TONTINE);
    await prisma.subscription.create({
      data: { userId: utilisateur.id, plan: PlanAbonnement.PREMIUM, prixMensuel: 15000, actif: true },
    });
    await creerTontine(utilisateur.id);
    await creerTontine(utilisateur.id);
    expect(await service.peutCreerTontine(utilisateur.id)).toBe(true);
  });
});

describe('renouvellement (Phase 6)', () => {
  it('renouvelle un plan expiré par un paiement simulé et réaugmente la date de fin', async () => {
    const utilisateur = await creerUtilisateur(Role.ADMIN_TONTINE);
    await prisma.subscription.create({
      data: {
        userId: utilisateur.id,
        plan: PlanAbonnement.STANDARD,
        prixMensuel: 5000,
        actif: true,
        aUtiliseEssai: true,
        dateFin: new Date(Date.now() - JOUR_MS),
      },
    });

    const renouvele = await service.renouveler(utilisateur.id);
    expect(renouvele).toMatchObject({ actif: true, enEssai: false, prixMensuel: 5000 });
    expect(dateAEnviron(renouvele.dateFin, 30)).toBe(true);
    expect(await service.peutCreerTontine(utilisateur.id)).toBe(true);
    expect(
      await prisma.transaction.count({
        where: { userId: utilisateur.id, type: TransactionType.ABONNEMENT },
      }),
    ).toBe(1);
  });

  it('refuse de renouveler le plan gratuit', async () => {
    const utilisateur = await creerUtilisateur(Role.ADMIN_TONTINE);
    await prisma.subscription.create({
      data: { userId: utilisateur.id, plan: PlanAbonnement.GRATUIT, prixMensuel: 0, actif: true },
    });
    await expect(service.renouveler(utilisateur.id)).rejects.toThrow(/gratuit/);
  });
});
