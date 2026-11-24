/**
 * Tests d'intégration métier sur une BASE DE TEST ISOLÉE.
 *
 * Aucune base de développement n'est réinitialisée : ce fichier cible
 * `tontine_saas_test`, préparée avec :
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
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { TontinesService } from '../src/tontines/tontines.service';
import { demainUTC, prochainJour } from '../src/common/dates.util';
import { NotificationsService } from '../src/notifications/notifications.service';

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://tontine:tontine@localhost:5433/tontine_saas_test?schema=public';

const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
const notifications = { creerNotification: jest.fn(), notifierVersement: jest.fn() };
const service = new TontinesService(
  prisma as any,
  {} as any,
  notifications as any,
  { log: jest.fn() } as any,
);

interface TontineTest {
  id: string;
  membres: Array<{ userId: string; memberId: string; ordrePassage: number }>;
}

async function creerTontineTest(options: {
  montant?: number;
  cycle?: number;
  dateDebut?: Date;
  ordres?: number[]; // ordrePassage dans l'ordre de création des deux membres
} = {}): Promise<TontineTest> {
  const prefix = randomUUID().slice(0, 8);
  const users = await Promise.all(
    [1, 2].map((i) =>
      prisma.user.create({
        data: {
          email: `test-${prefix}-${i}@example.com`,
          telephone: `+22177${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`,
          passwordHash: 'hash-de-test',
          nom: `Nom${i}`,
          prenom: `Prenom${i}`,
          role: i === 1 ? Role.ADMIN_TONTINE : Role.MEMBER,
          isVerified: true,
        },
      }),
    ),
  );

  const tontine = await prisma.tontine.create({
    data: {
      nom: `Tontine test ${prefix}`,
      montantCotisation: options.montant ?? 10000,
      frequence: TontineFrequency.HEBDOMADAIRE,
      jourCotisation: JourSemaine.LUNDI,
      nombreMaxMembres: 2,
      tauxCommission: 0.03,
      statut: TontineStatus.ACTIVE,
      dateDebut: options.dateDebut ?? new Date(Date.now() - 10 * 24 * 3600 * 1000),
      cycleActuel: options.cycle ?? 1,
      codeInvitation: randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase(),
      createurId: users[0].id,
    },
  });

  const ordres = options.ordres ?? [1, 2];
  const membres = await Promise.all(
    users.map((user, index) =>
      prisma.tontineMember.create({
        data: {
          tontineId: tontine.id,
          userId: user.id,
          ordrePassage: ordres[index],
        },
      }),
    ),
  );

  return {
    id: tontine.id,
    membres: membres.map((m, i) => ({
      userId: m.userId,
      memberId: m.id,
      ordrePassage: ordres[i],
    })),
  };
}

async function enregistrerCotisationManuelle(
  tontine: TontineTest,
  memberId: string,
  userId: string,
  cycle: number,
) {
  await prisma.transaction.create({
    data: {
      type: TransactionType.COTISATION,
      statut: TransactionStatus.REUSSIE,
      montantBrut: 10000,
      montantCommission: 300,
      montantNet: 9700,
      userId,
      tontineId: tontine.id,
      tontineMemberId: memberId,
      cycleConcerne: cycle,
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
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "demandes_adhesion", "amendes_retard", "pending_payments", "transactions", "tontine_members", "tontines", "subscriptions", "audit_logs", "notifications", "users" RESTART IDENTITY CASCADE',
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('commission plateforme et clôture atomique', () => {
  it('prélève 3% arrondis à l’entier inférieur sur chaque cotisation et verse une seule fois la cagnotte', async () => {
    const tontine = await creerTontineTest({ montant: 3333 });
    const [a, b] = tontine.membres;

    const paiements = await Promise.allSettled([
      service.enregistrerCotisation(tontine.id, a.userId, PaymentProvider.WAVE),
      service.enregistrerCotisation(tontine.id, b.userId, PaymentProvider.ORANGE_MONEY),
    ]);
    expect(paiements.every((p) => p.status === 'fulfilled')).toBe(true);

    const commissions = await prisma.transaction.findMany({
      where: { tontineId: tontine.id, type: TransactionType.COMMISSION },
    });
    expect(commissions).toHaveLength(2);
    expect(commissions.every((t) => Number(t.montantCommission) === 99)).toBe(true);

    const versements = await prisma.transaction.findMany({
      where: { tontineId: tontine.id, type: TransactionType.VERSEMENT_GAGNANT },
    });
    expect(versements).toHaveLength(1);
    expect(Number(versements[0].montantNet)).toBe(6468); // 2 * (3333 - 99)
    expect(Number(versements[0].montantCommission)).toBe(0); // 0% à la distribution

    const apres = await prisma.tontine.findUnique({ where: { id: tontine.id } });
    expect(apres?.cycleActuel).toBe(2);
    expect(notifications.notifierVersement).toHaveBeenCalledTimes(1);
  });

  it('refuse un second paiement simultané du même membre et ne verse pas deux fois', async () => {
    const tontine = await creerTontineTest();
    const [a, b] = tontine.membres;

    const doubles = await Promise.allSettled([
      service.enregistrerCotisation(tontine.id, a.userId, PaymentProvider.WAVE),
      service.enregistrerCotisation(tontine.id, a.userId, PaymentProvider.WAVE),
    ]);
    expect(doubles.filter((p) => p.status === 'fulfilled')).toHaveLength(1);
    expect(doubles.filter((p) => p.status === 'rejected')).toHaveLength(1);

    const cotisations = await prisma.transaction.count({
      where: { tontineId: tontine.id, type: TransactionType.COTISATION },
    });
    expect(cotisations).toBe(1);
    expect(
      await prisma.transaction.count({
        where: { tontineId: tontine.id, type: TransactionType.VERSEMENT_GAGNANT },
      }),
    ).toBe(0);

    await service.enregistrerCotisation(tontine.id, b.userId, PaymentProvider.WAVE);
    expect(
      await prisma.transaction.count({
        where: { tontineId: tontine.id, type: TransactionType.VERSEMENT_GAGNANT },
      }),
    ).toBe(1);
  });
});

describe('amende de retard et blocage des impayés', () => {
  it('bloque le tour courant, crée une amende unique et la verse au bénéficiaire du tour', async () => {
    // m1 (ordre 2, bénéficiaire du tour 2) a payé les tours 1 et 2 ; m2 (ordre 1) n'a rien payé.
    const tontine = await creerTontineTest({
      cycle: 2,
      dateDebut: new Date(Date.now() - 20 * 24 * 3600 * 1000),
      ordres: [2, 1],
    });
    const [beneficiaire, retardataire] = tontine.membres;
    await enregistrerCotisationManuelle(
      tontine,
      beneficiaire.memberId,
      beneficiaire.userId,
      1,
    );
    await enregistrerCotisationManuelle(
      tontine,
      beneficiaire.memberId,
      beneficiaire.userId,
      2,
    );

    await expect(
      service.enregistrerCotisation(tontine.id, retardataire.userId, PaymentProvider.WAVE),
    ).rejects.toThrow(/Arriéré non réglé/);
    await expect(
      service.enregistrerCotisation(
        tontine.id,
        retardataire.userId,
        PaymentProvider.WAVE,
        undefined,
        undefined,
        2,
      ),
    ).rejects.toThrow(/Arriéré non réglé/);

    // Règlement de l'arriéré (tour 1) : cotisation + amende de 10%.
    await service.enregistrerCotisation(
      tontine.id,
      retardataire.userId,
      PaymentProvider.WAVE,
      undefined,
      undefined,
      1,
    );

    const amendes = await prisma.amendeRetard.findMany({
      where: { tontineId: tontine.id },
    });
    expect(amendes).toHaveLength(1);
    expect(amendes[0].cycleConcerne).toBe(1);
    expect(Number(amendes[0].montant)).toBe(1000);
    expect(amendes[0].beneficiaireUserId).toBe(beneficiaire.userId);

    const transactionsAmende = await prisma.transaction.findMany({
      where: { tontineId: tontine.id, type: TransactionType.AMENDE_RETARD },
    });
    expect(transactionsAmende).toHaveLength(1);
    expect(Number(transactionsAmende[0].montantCommission)).toBe(0);

    // Une seconde tentative sur le même arriéré est refusée, sans nouvelle amende.
    await expect(
      service.enregistrerCotisation(
        tontine.id,
        retardataire.userId,
        PaymentProvider.WAVE,
        undefined,
        undefined,
        1,
      ),
    ).rejects.toThrow();
    expect(await prisma.amendeRetard.count({ where: { tontineId: tontine.id } })).toBe(1);

    // Le tour courant peut maintenant être payé ; l'amende gonfle la cagnotte.
    await service.enregistrerCotisation(tontine.id, retardataire.userId, PaymentProvider.WAVE);
    const versement = await prisma.transaction.findFirst({
      where: { tontineId: tontine.id, type: TransactionType.VERSEMENT_GAGNANT },
    });
    expect(Number(versement?.montantNet)).toBe(20400); // 9700 + 9700 + 1000
    expect(versement?.userId).toBe(beneficiaire.userId);
  });

  it('n’applique aucune amende pendant le délai de grâce', async () => {
    const tontine = await creerTontineTest({
      cycle: 2,
      dateDebut: new Date(Date.now() - 23 * 3600 * 1000), // tour 1 échu depuis moins de 24 h
      ordres: [2, 1],
    });
    const [beneficiaire, retardataire] = tontine.membres;
    await enregistrerCotisationManuelle(tontine, beneficiaire.memberId, beneficiaire.userId, 1);

    const cible = await service.analyserPaiement(tontine.id, retardataire.userId, 1);
    expect(cible.montantAmende).toBe(0);
    expect(cible.montantTotal).toBe(10000);

    await service.enregistrerCotisation(
      tontine.id,
      retardataire.userId,
      PaymentProvider.WAVE,
      undefined,
      undefined,
      1,
    );
    expect(await prisma.amendeRetard.count({ where: { tontineId: tontine.id } })).toBe(0);
  });
});

describe('cohérence des statuts', () => {
  it('réactive un membre en retard seulement après régularisation', async () => {
    const tontine = await creerTontineTest();
    const [a, b] = tontine.membres;
    await prisma.tontineMember.update({
      where: { id: b.memberId },
      data: { statut: MemberStatus.EN_RETARD },
    });

    await service.enregistrerCotisation(tontine.id, a.userId, PaymentProvider.WAVE);
    const avant = await prisma.tontineMember.findUnique({ where: { id: b.memberId } });
    expect(avant?.statut).toBe(MemberStatus.EN_RETARD);

    await service.enregistrerCotisation(tontine.id, b.userId, PaymentProvider.WAVE);
    const apres = await prisma.tontineMember.findUnique({ where: { id: b.memberId } });
    expect(apres?.statut).toBe(MemberStatus.ACTIF);
  });
});

describe('démarrage au jour de cotisation (Phase 2)', () => {
  it('fixe dateDebut au prochain jour choisi, au plus tôt demain (UTC)', async () => {
    const prefix = randomUUID().slice(0, 8);
    const createur = await prisma.user.create({
      data: {
        email: `test-start-${prefix}@example.com`,
        telephone: `+22177${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`,
        passwordHash: 'hash-de-test',
        nom: 'Admin',
        prenom: 'Test',
        role: Role.ADMIN_TONTINE,
        isVerified: true,
      },
    });
    const tontine = await prisma.tontine.create({
      data: {
        nom: `Tontine démarrage ${prefix}`,
        montantCotisation: 10000,
        frequence: TontineFrequency.HEBDOMADAIRE,
        jourCotisation: JourSemaine.VENDREDI,
        nombreMaxMembres: 2,
        statut: TontineStatus.EN_ATTENTE,
        codeInvitation: randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase(),
        createurId: createur.id,
      },
    });
    const secondMembre = await prisma.user.create({
      data: {
        email: `test-start-2-${prefix}@example.com`,
        telephone: `+22177${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`,
        passwordHash: 'hash-de-test',
        nom: 'Membre',
        prenom: 'Test',
        role: Role.MEMBER,
        isVerified: true,
      },
    });
    await Promise.all(
      [createur.id, secondMembre.id].map((userId, index) =>
        prisma.tontineMember.create({
          data: { tontineId: tontine.id, userId, ordrePassage: index + 1 },
        }),
      ),
    );

    const avant = new Date();
    const demarree = await service.demarrer(tontine.id, createur.id);
    const attendu = prochainJour(demainUTC(avant), JourSemaine.VENDREDI);

    expect(demarree.statut).toBe(TontineStatus.ACTIVE);
    expect(demarree.dateDebut?.toISOString()).toBe(attendu.toISOString());
    expect(demarree.dateDebut?.getUTCDay()).toBe(5); // vendredi
  });
});

describe('rappels du cron 8h (Phase 2)', () => {
  const maintenant = new Date('2026-06-15T08:00:00.000Z');
  const rappels = new NotificationsService(prisma as any);

  it('prévient la veille de l’échéance du tour, une seule fois', async () => {
    const tontine = await creerTontineTest({ dateDebut: new Date('2026-06-16T00:00:00.000Z') });
    const userId = tontine.membres[0].userId;

    await rappels.verifierEcheancesEtRelancer(maintenant);
    let titres = (await prisma.notification.findMany({ where: { userId } })).map((n) => n.titre);
    expect(titres).toContain('Cotisation demain');

    await rappels.verifierEcheancesEtRelancer(maintenant);
    titres = (await prisma.notification.findMany({ where: { userId } })).map((n) => n.titre);
    expect(titres.filter((t) => t === 'Cotisation demain')).toHaveLength(1);
  });

  it('prévient le jour même de l’échéance du tour', async () => {
    const tontine = await creerTontineTest({ dateDebut: new Date('2026-06-15T00:00:00.000Z') });
    const userId = tontine.membres[0].userId;

    await rappels.verifierEcheancesEtRelancer(maintenant);
    const titres = (await prisma.notification.findMany({ where: { userId } })).map((n) => n.titre);
    expect(titres).toContain('Cotisation aujourd’hui');
  });

  it('marque EN_RETARD et prévient après le délai de grâce', async () => {
    const tontine = await creerTontineTest({ dateDebut: new Date('2026-06-12T00:00:00.000Z') });
    const membre = tontine.membres[0];

    await rappels.verifierEcheancesEtRelancer(maintenant);
    const titres = (await prisma.notification.findMany({ where: { userId: membre.userId } })).map(
      (n) => n.titre,
    );
    expect(titres).toContain('Cotisation en retard');
    const apres = await prisma.tontineMember.findUnique({ where: { id: membre.memberId } });
    expect(apres?.statut).toBe(MemberStatus.EN_RETARD);
  });
});
