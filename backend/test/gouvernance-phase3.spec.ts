/**
 * Tests d'intégration de la Phase 3 (gouvernance) sur la base de test isolée.
 *
 * Aucune base de développement n'est réinitialisée. Préparation :
 *   DATABASE_URL=postgresql://tontine:tontine@localhost:5433/tontine_saas_test?schema=public npx prisma migrate deploy
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  JourSemaine,
  MemberStatus,
  PaymentProvider,
  PlanAbonnement,
  PrismaClient,
  Role,
  StatutDemandeAdhesion,
  TontineFrequency,
  TontineStatus,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { randomInt, randomUUID } from 'crypto';
import { TontinesService } from '../src/tontines/tontines.service';
import { MemberController } from '../src/member/member.controller';
import { AdminController } from '../src/admin/admin.controller';
import { NotificationsService } from '../src/notifications/notifications.service';

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://tontine:tontine@localhost:5433/tontine_saas_test?schema=public';

const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
const notifications = { creerNotification: jest.fn(), notifierVersement: jest.fn() };
const audit = { log: jest.fn() };
const service = new TontinesService(
  prisma as any,
  {} as any,
  notifications as any,
  audit as any,
);
/**
 * Le vrai flux payant est testé dans passage-admin.spec.ts. Ici on vérifie
 * simplement que le contrôleur n'accorde le rôle qu'après confirmation.
 */
const paiements = {
  initierPassageAdmin: jest.fn(async () => ({
    referenceInterne: 'passage-admin-ref-test',
    montant: 1000,
  })),
  confirmerPassageAdmin: jest.fn(async (userId: string, _reference?: string) => {
    await prisma.user.update({
      where: { id: userId },
      data: { role: Role.ADMIN_TONTINE },
    });
    await prisma.subscription.upsert({
      where: { userId },
      update: { actif: true },
      create: { userId, plan: PlanAbonnement.GRATUIT, prixMensuel: 0, actif: true },
    });
    return { role: Role.ADMIN_TONTINE, message: 'Paiement confirmé.' };
  }),
};
const memberController = new MemberController(
  prisma as any,
  paiements as any,
  service,
  audit as any,
);
const adminController = new AdminController(
  prisma as any,
  audit as any,
  new NotificationsService(prisma as any),
);

async function creerUtilisateur(role: Role = Role.MEMBER, prefix = 'phase3') {
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

async function creerTontine(
  createurId: string,
  options: {
    nombreMaxMembres?: number;
    statut?: TontineStatus;
    cycle?: number;
  } = {},
) {
  return prisma.tontine.create({
    data: {
      nom: `Tontine phase3 ${randomUUID().slice(0, 8)}`,
      montantCotisation: 10000,
      frequence: TontineFrequency.HEBDOMADAIRE,
      jourCotisation: JourSemaine.LUNDI,
      nombreMaxMembres: options.nombreMaxMembres ?? 2,
      tauxCommission: 0.03,
      statut: options.statut ?? TontineStatus.EN_ATTENTE,
      cycleActuel: options.cycle ?? 1,
      dateDebut: new Date(Date.now() - 10 * 24 * 3600 * 1000),
      codeInvitation: randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase(),
      createurId,
    },
  });
}

async function ajouterMembres(tontineId: string, userIds: string[]) {
  return Promise.all(
    userIds.map((userId, index) =>
      prisma.tontineMember.create({
        data: { tontineId, userId, ordrePassage: index + 1 },
      }),
    ),
  );
}

async function payerManuellement(tontineId: string, membreId: string, userId: string, cycle: number) {
  await prisma.transaction.create({
    data: {
      type: TransactionType.COTISATION,
      statut: TransactionStatus.REUSSIE,
      provider: PaymentProvider.WAVE,
      montantBrut: 10000,
      montantCommission: 300,
      montantNet: 9700,
      userId,
      tontineId,
      tontineMemberId: membreId,
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

describe('rôles et gouvernance (Phase 3)', () => {
  it('interdit à un MEMBER de créer une tontine', async () => {
    const member = await creerUtilisateur(Role.MEMBER);
    await expect(
      service.creer(member.id, {
        nom: 'Tontine interdite',
        montantCotisation: 10000,
        nombreMaxMembres: 2,
      } as any),
    ).rejects.toThrow(/Devenir Admin/);
  });

  it('ne change le rôle qu’après confirmation du paiement, jamais en SUPER_ADMIN', async () => {
    const member = await creerUtilisateur(Role.MEMBER);
    const req = { user: { id: member.id } };

    const initiation = await memberController.devenirAdmin(
      { provider: PaymentProvider.WAVE } as any,
      req,
    );
    expect(initiation.referenceInterne).toBe('passage-admin-ref-test');
    const avantConfirmation = await prisma.user.findUnique({ where: { id: member.id } });
    expect(avantConfirmation?.role).toBe(Role.MEMBER);

    const confirmation = await memberController.confirmerDevenirAdmin(
      { referenceInterne: 'passage-admin-ref-test' } as any,
      req,
    );
    expect(confirmation.role).toBe(Role.ADMIN_TONTINE);
    const apres = await prisma.user.findUnique({ where: { id: member.id } });
    expect(apres?.role).toBe(Role.ADMIN_TONTINE);

    const abonnement = await prisma.subscription.findUnique({ where: { userId: member.id } });
    expect(abonnement?.plan).toBe(PlanAbonnement.GRATUIT);
    expect(Number(abonnement?.prixMensuel)).toBe(0);
    expect(paiements.confirmerPassageAdmin).toHaveBeenCalledWith(
      member.id,
      'passage-admin-ref-test',
    );
  });
});

describe('demandes d’adhésion (Phase 3)', () => {
  it('crée une demande en attente au lieu d’un membre, puis accepte ou refuse', async () => {
    const admin = await creerUtilisateur(Role.ADMIN_TONTINE, 'admin');
    const demandeur = await creerUtilisateur(Role.MEMBER, 'demandeur');
    const tontine = await creerTontine(admin.id, { nombreMaxMembres: 3 });

    const reponse = await service.rejoindreParCode(tontine.codeInvitation, demandeur.id);
    expect(reponse.message).toMatch(/Demande envoyée/);
    expect(
      await prisma.tontineMember.count({ where: { tontineId: tontine.id } }),
    ).toBe(0);

    const demande = await prisma.demandeAdhesion.findFirst({
      where: { tontineId: tontine.id, userId: demandeur.id },
    });
    expect(demande?.statut).toBe(StatutDemandeAdhesion.EN_ATTENTE);

    await expect(service.rejoindreParCode(tontine.codeInvitation, demandeur.id)).rejects.toThrow(
      /déjà en attente/,
    );

    const acceptee = await service.repondreDemande(demande!.id, admin.id, true);
    expect(acceptee.accepte).toBe(true);
    expect(
      await prisma.tontineMember.count({ where: { tontineId: tontine.id } }),
    ).toBe(1);
    const apresAcceptation = await prisma.demandeAdhesion.findUnique({ where: { id: demande!.id } });
    expect(apresAcceptation?.statut).toBe(StatutDemandeAdhesion.ACCEPTEE);
    expect(apresAcceptation?.traiteeParId).toBe(admin.id);

    const second = await creerUtilisateur(Role.MEMBER, 'refuse');
    await service.rejoindre(tontine.id, second.id);
    const demandeRefusee = await prisma.demandeAdhesion.findFirst({
      where: { tontineId: tontine.id, userId: second.id },
    });
    await service.repondreDemande(demandeRefusee!.id, admin.id, false, 'Place réservée');
    const apresRefus = await prisma.demandeAdhesion.findUnique({ where: { id: demandeRefusee!.id } });
    expect(apresRefus?.statut).toBe(StatutDemandeAdhesion.REFUSEE);
    expect(apresRefus?.motifRefus).toBe('Place réservée');
    expect(
      await prisma.tontineMember.count({ where: { tontineId: tontine.id } }),
    ).toBe(1);
  });

  it('empêche un membre non autorisé de traiter une demande', async () => {
    const admin = await creerUtilisateur(Role.ADMIN_TONTINE, 'admin');
    const intrus = await creerUtilisateur(Role.ADMIN_TONTINE, 'intrus');
    const demandeur = await creerUtilisateur(Role.MEMBER, 'demandeur');
    const tontine = await creerTontine(admin.id);
    await service.rejoindre(tontine.id, demandeur.id);
    const demande = await prisma.demandeAdhesion.findFirst({ where: { tontineId: tontine.id } });

    await expect(service.repondreDemande(demande!.id, intrus.id, true)).rejects.toThrow(
      /administrateur de cette tontine/,
    );
  });
});

describe('tirage au sort de l’ordre de passage (Phase 3)', () => {
  it('réattribue des rangs uniques de 1 à N et n’est pas l’ordre d’inscription', async () => {
    const admin = await creerUtilisateur(Role.ADMIN_TONTINE, 'admin');
    const sequences: number[][] = [];

    for (let i = 0; i < 10; i++) {
      const tontine = await creerTontine(admin.id, { nombreMaxMembres: 3 });
      const users = [
        await creerUtilisateur(Role.MEMBER, 'tirage1'),
        await creerUtilisateur(Role.MEMBER, 'tirage2'),
        await creerUtilisateur(Role.MEMBER, 'tirage3'),
      ];
      await ajouterMembres(tontine.id, users.map((u) => u.id));

      await service.demarrer(tontine.id, admin.id);
      const membres = await prisma.tontineMember.findMany({
        where: { tontineId: tontine.id },
        orderBy: { ordrePassage: 'asc' },
      });
      sequences.push(membres.map((m) => m.ordrePassage));
    }

    for (const ordres of sequences) {
      expect(ordres).toEqual([1, 2, 3]);
      expect(new Set(ordres).size).toBe(3);
    }
    expect(sequences.some((ordres, index) => ordres[index] !== index + 1)).toBe(true);
  });
});

describe('exclusion et remboursement à la clôture (Phase 3)', () => {
  it('bloque les paiements d’un exclu et le rembourse une seule fois à la clôture', async () => {
    const admin = await creerUtilisateur(Role.ADMIN_TONTINE, 'admin');
    const tontine = await creerTontine(admin.id, {
      statut: TontineStatus.ACTIVE,
      nombreMaxMembres: 2,
    });
    const [exclu, restant] = await Promise.all([
      creerUtilisateur(Role.MEMBER, 'exclu'),
      creerUtilisateur(Role.MEMBER, 'restant'),
    ]);
    const membres = await ajouterMembres(tontine.id, [exclu.id, restant.id]);

    await payerManuellement(tontine.id, membres[0].id, exclu.id, 1);
    await service.exclureMembre(tontine.id, exclu.id, admin.id);

    const apresExclusion = await prisma.tontineMember.findUnique({ where: { id: membres[0].id } });
    expect(apresExclusion?.statut).toBe(MemberStatus.EXCLU);
    await expect(
      service.enregistrerCotisation(tontine.id, exclu.id, PaymentProvider.WAVE),
    ).rejects.toThrow(/exclu/);

    await service.enregistrerCotisation(tontine.id, restant.id, PaymentProvider.WAVE);

    const remboursements = await prisma.transaction.findMany({
      where: { tontineId: tontine.id, type: TransactionType.REMBOURSEMENT },
    });
    expect(remboursements).toHaveLength(1);
    expect(Number(remboursements[0].montantNet)).toBe(9700);
    expect(Number(remboursements[0].montantCommission)).toBe(0);
    expect(remboursements[0].userId).toBe(exclu.id);

    const versement = await prisma.transaction.findFirst({
      where: { tontineId: tontine.id, type: TransactionType.VERSEMENT_GAGNANT },
    });
    expect(Number(versement?.montantNet)).toBe(19400);
    expect(await prisma.tontine.findUnique({ where: { id: tontine.id } })).toMatchObject({
      statut: TontineStatus.TERMINEE,
    });
  });
});

describe('suppression sécurisée par le Super-Admin (Phase 3)', () => {
  const acteur = { user: { id: 'super-admin-test' } };

  it('exige un avertissement puis un délai avant suppression', async () => {
    const admin = await creerUtilisateur(Role.ADMIN_TONTINE, 'admin');
    const tontine = await creerTontine(admin.id);

    const avertissement = await adminController.avertirSuppression(tontine.id, acteur);
    expect(avertissement.delaiJours).toBe(7);
    expect(
      await prisma.notification.count({
        where: { userId: admin.id, titre: 'Avertissement de suppression' },
      }),
    ).toBe(1);

    await expect(adminController.supprimerTontine(tontine.id, acteur)).rejects.toThrow(
      /Délai de 7 jours non écoulé/,
    );
    expect(await prisma.tontine.findUnique({ where: { id: tontine.id } })).not.toBeNull();
  });

  it('refuse la suppression après le délai si de l’argent est engagé', async () => {
    const admin = await creerUtilisateur(Role.ADMIN_TONTINE, 'admin');
    const tontine = await creerTontine(admin.id);
    const membre = await creerUtilisateur(Role.MEMBER, 'membre');
    const participation = (await ajouterMembres(tontine.id, [membre.id]))[0];
    await payerManuellement(tontine.id, participation.id, membre.id, 1);
    await prisma.tontine.update({
      where: { id: tontine.id },
      data: { suppressionDemandeeAt: new Date(Date.now() - 8 * 24 * 3600 * 1000) },
    });

    await expect(adminController.supprimerTontine(tontine.id, acteur)).rejects.toThrow(
      /argent engagé/,
    );
    expect(await prisma.tontine.findUnique({ where: { id: tontine.id } })).not.toBeNull();
  });

  it('supprime après le délai et sans argent engagé, avec audit', async () => {
    const admin = await creerUtilisateur(Role.ADMIN_TONTINE, 'admin');
    const demandeur = await creerUtilisateur(Role.MEMBER, 'demandeur');
    const tontine = await creerTontine(admin.id, { nombreMaxMembres: 3 });
    await service.rejoindre(tontine.id, demandeur.id);
    await prisma.tontine.update({
      where: { id: tontine.id },
      data: { suppressionDemandeeAt: new Date(Date.now() - 8 * 24 * 3600 * 1000) },
    });

    const resultat = await adminController.supprimerTontine(tontine.id, acteur);
    expect(resultat.message).toMatch(/supprimée/);
    expect(await prisma.tontine.findUnique({ where: { id: tontine.id } })).toBeNull();
    expect(await prisma.demandeAdhesion.count({ where: { tontineId: tontine.id } })).toBe(0);
    expect(await prisma.tontineMember.count({ where: { tontineId: tontine.id } })).toBe(0);
    expect(audit.log).toHaveBeenCalledWith('TONTINE_SUPPRIMEE', tontine.id, acteur.user.id, {
      nom: tontine.nom,
    });
  });
});
