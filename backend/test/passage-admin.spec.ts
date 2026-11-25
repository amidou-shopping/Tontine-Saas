/**
 * Point 3 — passage MEMBER -> ADMIN_TONTINE payant, configurable et idempotent.
 *
 * Tests d'intégration sur la BASE DE TEST ISOLÉE (jamais la base de dev) :
 *   DATABASE_URL=postgresql://tontine:tontine@localhost:5433/tontine_saas_test?schema=public npx prisma migrate deploy
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  PaymentProvider,
  PlanAbonnement,
  PrismaClient,
  Role,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { randomInt, randomUUID } from 'crypto';
import { PaymentsService } from '../src/payments/payments.service';

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://tontine:tontine@localhost:5433/tontine_saas_test?schema=public';

const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
const audit = { log: jest.fn() };
const redis = { setnx: jest.fn(async () => true) };
const tontines = { enregistrerCotisation: jest.fn() };
const providerSimule = {
  initierPaiement: jest.fn(async (_montant: number, _tel: string, reference: string) => ({
    referenceExterne: `sim_${reference}`,
  })),
  verifierSignatureWebhook: jest.fn(() => true),
};
const service = new PaymentsService(
  prisma as any,
  redis as any,
  audit as any,
  tontines as any,
  providerSimule as any,
  providerSimule as any,
  providerSimule as any,
);

async function creerUtilisateur(role: Role, isVerified = true) {
  const identifiant = randomUUID().slice(0, 8);
  return prisma.user.create({
    data: {
      email: `passage-${identifiant}@example.com`,
      telephone: `+22177${String(randomInt(0, 1e8)).padStart(8, '0')}`,
      passwordHash: 'hash-de-test',
      nom: `Nom${identifiant}`,
      prenom: 'Test',
      role,
      isVerified,
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
  delete process.env.FRAIS_PASSAGE_ADMIN;
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "demandes_adhesion", "amendes_retard", "pending_payments", "transactions", "tontine_members", "tontines", "subscriptions", "audit_logs", "notifications", "users" RESTART IDENTITY CASCADE',
  );
});

afterAll(async () => {
  delete process.env.FRAIS_PASSAGE_ADMIN;
  await prisma.$disconnect();
});

describe('tarif configurable', () => {
  it('lit 1000 F par défaut et accepte la surcharge FRAIS_PASSAGE_ADMIN', async () => {
    const utilisateur = await creerUtilisateur(Role.MEMBER);

    const parDefaut = await service.initierPassageAdmin(utilisateur.id, PaymentProvider.WAVE);
    expect(parDefaut.montant).toBe(1000);

    await prisma.pendingPayment.deleteMany({ where: { userId: utilisateur.id } });
    process.env.FRAIS_PASSAGE_ADMIN = '2500';
    const surcharge = await service.initierPassageAdmin(utilisateur.id, PaymentProvider.WAVE);
    expect(surcharge.montant).toBe(2500);
  });
});

describe('initiation du paiement', () => {
  it('ne change pas le rôle avant confirmation et refuse un double paiement', async () => {
    const utilisateur = await creerUtilisateur(Role.MEMBER);
    const initiation = await service.initierPassageAdmin(utilisateur.id, PaymentProvider.WAVE);

    const apresInitiation = await prisma.user.findUnique({ where: { id: utilisateur.id } });
    expect(apresInitiation?.role).toBe(Role.MEMBER);
    const pending = await prisma.pendingPayment.findUnique({
      where: { referenceInterne: initiation.referenceInterne },
    });
    expect(pending?.type).toBe('PASSAGE_ADMIN');
    expect(Number(pending?.montantBrut)).toBe(1000);

    await expect(
      service.initierPassageAdmin(utilisateur.id, PaymentProvider.WAVE),
    ).rejects.toThrow(/déjà en cours/);
  });

  it('exige un téléphone vérifié', async () => {
    const utilisateur = await creerUtilisateur(Role.MEMBER, false);
    await expect(
      service.initierPassageAdmin(utilisateur.id, PaymentProvider.WAVE),
    ).rejects.toThrow(/téléphone doit être vérifié/);
  });
});

describe('confirmation et idempotence', () => {
  it('applique paiement, rôle et audit dans une transaction, sans double facturation', async () => {
    const utilisateur = await creerUtilisateur(Role.MEMBER);
    const initiation = await service.initierPassageAdmin(utilisateur.id, PaymentProvider.WAVE);

    const confirmation = await service.confirmerPassageAdmin(
      utilisateur.id,
      initiation.referenceInterne,
    );
    expect(confirmation.role).toBe(Role.ADMIN_TONTINE);
    expect(confirmation.montant).toBe(1000);

    const apres = await prisma.user.findUnique({ where: { id: utilisateur.id } });
    expect(apres?.role).toBe(Role.ADMIN_TONTINE);
    const transactions = await prisma.transaction.findMany({
      where: { userId: utilisateur.id, type: TransactionType.PASSAGE_ADMIN },
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].statut).toBe(TransactionStatus.REUSSIE);
    expect(transactions[0].tontineId).toBeNull();

    const abonnement = await prisma.subscription.findUnique({ where: { userId: utilisateur.id } });
    expect(abonnement?.plan).toBe(PlanAbonnement.GRATUIT);
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      'PASSAGE_ADMIN_PAYE',
      utilisateur.id,
      utilisateur.id,
      expect.objectContaining({ montant: 1000, referenceInterne: initiation.referenceInterne }),
    );

    // Double clic / webhook rejoué : message clair, aucune écriture supplémentaire.
    const rejouee = await service.confirmerPassageAdmin(
      utilisateur.id,
      initiation.referenceInterne,
    );
    expect(rejouee.message).toMatch(/déjà confirmé/);
    expect(await prisma.transaction.count({ where: { userId: utilisateur.id } })).toBe(1);
    expect(audit.log).toHaveBeenCalledTimes(1);
    await expect(
      service.initierPassageAdmin(utilisateur.id, PaymentProvider.WAVE),
    ).rejects.toThrow(/déjà administrateur/);
  });

  it('refuse la confirmation pour un autre utilisateur', async () => {
    const utilisateur = await creerUtilisateur(Role.MEMBER);
    const intrus = await creerUtilisateur(Role.MEMBER);
    const initiation = await service.initierPassageAdmin(utilisateur.id, PaymentProvider.WAVE);

    await expect(
      service.confirmerPassageAdmin(intrus.id, initiation.referenceInterne),
    ).rejects.toThrow(/introuvable/);
    const apres = await prisma.user.findUnique({ where: { id: intrus.id } });
    expect(apres?.role).toBe(Role.MEMBER);
  });
});

describe('webhook passage admin', () => {
  it('confirme le rôle via le webhook et ignore un webhook rejoué', async () => {
    const utilisateur = await creerUtilisateur(Role.MEMBER);
    const initiation = await service.initierPassageAdmin(utilisateur.id, PaymentProvider.WAVE);
    const payload = {
      reference: initiation.referenceInterne,
      statut: 'SUCCESS',
      transaction_id: 'wave_webhook_ref',
    };

    const premier = await service.traiterWebhook(
      'WAVE',
      JSON.stringify(payload),
      { 'wave-signature': 'test' },
      payload,
    );
    expect(premier).toEqual(expect.objectContaining({ received: true, type: 'PASSAGE_ADMIN' }));

    const apres = await prisma.user.findUnique({ where: { id: utilisateur.id } });
    expect(apres?.role).toBe(Role.ADMIN_TONTINE);
    const transactions = await prisma.transaction.findMany({
      where: { userId: utilisateur.id, type: TransactionType.PASSAGE_ADMIN },
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].referenceExterne).toBe('wave_webhook_ref');
    expect(tontines.enregistrerCotisation).not.toHaveBeenCalled();

    const rejoue = await service.traiterWebhook(
      'WAVE',
      JSON.stringify(payload),
      { 'wave-signature': 'test' },
      payload,
    );
    expect(rejoue).toEqual(expect.objectContaining({ received: true }));
    expect(await prisma.transaction.count({ where: { userId: utilisateur.id } })).toBe(1);
  });
});
