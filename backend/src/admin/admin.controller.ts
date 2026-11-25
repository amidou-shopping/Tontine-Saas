/**
 * admin.controller.ts
 * ----------------------------------------------------------------------------
 * Endpoints réservés au SUPER_ADMIN : pilotage financier de la plateforme
 * et gestion des utilisateurs (back-office).
 * ----------------------------------------------------------------------------
 */

import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  UseGuards,
  Query,
  Req,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { lireDelaiAvertissementSuppression } from '../common/parametres-financiers';
import { verifierGestionSuperAdmin } from '../common/super-admins.util';
import {
  Role,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard) // Authentification + vérification du rôle
@Roles(Role.SUPER_ADMIN)             // Seul le Super-Admin accède à ce contrôleur
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * GET /admin/dashboard
   * Retourne les KPIs financiers globaux de la plateforme :
   *  - Chiffre d'affaires SaaS (commissions de transactions + abonnements payants)
   *  - GMV (Gross Merchandise Volume) = volume total des cotisations traitées
   *  - Statistiques utilisateurs
   */
  @Get('dashboard')
  async getDashboard(
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
  ) {
    const filtreDate = this.buildDateFilter(dateDebut, dateFin);

    // 1. Chiffre d'affaires = somme des commissions prélevées + abonnements encaissés
    const [commissions, abonnements] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: {
          type: TransactionType.COMMISSION,
          statut: TransactionStatus.REUSSIE,
          createdAt: filtreDate,
        },
        _sum: { montantCommission: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          type: TransactionType.ABONNEMENT,
          statut: TransactionStatus.REUSSIE,
          createdAt: filtreDate,
        },
        _sum: { montantBrut: true },
      }),
    ]);

    const chiffreAffairesCommissions = Number(commissions._sum.montantCommission ?? 0);
    const chiffreAffairesAbonnements = Number(abonnements._sum.montantBrut ?? 0);
    const chiffreAffairesTotal = chiffreAffairesCommissions + chiffreAffairesAbonnements;

    // 2. GMV = volume brut total des cotisations qui ont transité par la plateforme
    const gmvAgg = await this.prisma.transaction.aggregate({
      where: {
        type: TransactionType.COTISATION,
        statut: TransactionStatus.REUSSIE,
        createdAt: filtreDate,
      },
      _sum: { montantBrut: true },
      _count: true,
    });

    // 3. Stats utilisateurs & tontines actives (pour contexte du dashboard)
    const [totalUtilisateurs, utilisateursBloques, tontinesActives] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isBlocked: true } }),
      this.prisma.tontine.count({ where: { statut: 'ACTIVE' } }),
    ]);

    return {
      periode: { dateDebut: dateDebut ?? null, dateFin: dateFin ?? null },
      chiffreAffaires: {
        total: chiffreAffairesTotal,
        commissions: chiffreAffairesCommissions,
        abonnements: chiffreAffairesAbonnements,
      },
      gmv: {
        montantTotal: Number(gmvAgg._sum.montantBrut ?? 0),
        nombreTransactions: gmvAgg._count,
      },
      utilisateurs: {
        total: totalUtilisateurs,
        bloques: utilisateursBloques,
      },
      tontinesActives,
    };
  }

  /**
   * GET /admin/dashboard/revenue-timeseries
   * Série temporelle du chiffre d'affaires (commissions + abonnements) jour par jour,
   * pour alimenter le graphique RevenueChart du dashboard admin.
   */
  @Get('dashboard/revenue-timeseries')
  async getRevenueTimeseries(
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
  ) {
    const filtreDate = this.buildDateFilter(dateDebut, dateFin);

    // On agrège les commissions et abonnements par jour
    const [commissions, abonnements] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['createdAt'],
        where: {
          type: TransactionType.COMMISSION,
          statut: TransactionStatus.REUSSIE,
          ...(filtreDate ? { createdAt: filtreDate } : {}),
        },
        _sum: { montantCommission: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['createdAt'],
        where: {
          type: TransactionType.ABONNEMENT,
          statut: TransactionStatus.REUSSIE,
          ...(filtreDate ? { createdAt: filtreDate } : {}),
        },
        _sum: { montantBrut: true },
      }),
    ]);

    // Fusionne les deux séries par date
    const parDate = new Map<string, { date: string; commissions: number; abonnements: number }>();

    for (const row of commissions) {
      const date = row.createdAt.toISOString().slice(0, 10);
      const existing = parDate.get(date) ?? { date, commissions: 0, abonnements: 0 };
      existing.commissions += Number(row._sum.montantCommission ?? 0);
      parDate.set(date, existing);
    }

    for (const row of abonnements) {
      const date = row.createdAt.toISOString().slice(0, 10);
      const existing = parDate.get(date) ?? { date, commissions: 0, abonnements: 0 };
      existing.abonnements += Number(row._sum.montantBrut ?? 0);
      parDate.set(date, existing);
    }

    const data = Array.from(parDate.values()).sort((a, b) => a.date.localeCompare(b.date));

    return { data };
  }

  /**
   * GET /admin/users
   * Liste paginée des utilisateurs, avec recherche simple.
   */
  @Get('users')
  async listUsers(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
  ) {
    const numeroPage = Number(page);
    const taillePage = Number(limit);
    if (!Number.isInteger(numeroPage) || numeroPage < 1) {
      throw new BadRequestException('Le numéro de page doit être un entier positif.');
    }
    if (!Number.isInteger(taillePage) || taillePage < 1 || taillePage > 100) {
      throw new BadRequestException('La limite doit être un entier compris entre 1 et 100.');
    }
    const skip = (numeroPage - 1) * taillePage;

    const where = search
      ? {
          OR: [
            { nom: { contains: search, mode: 'insensitive' as const } },
            { prenom: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { telephone: { contains: search } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: taillePage,
        select: {
          id: true,
          nom: true,
          prenom: true,
          email: true,
          telephone: true,
          role: true,
          estPrincipal: true,
          isBlocked: true,
          isVerified: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data: users, total, page: numeroPage, limit: taillePage };
  }

  /**
   * PATCH /admin/users/:id/block
   * Suspend un utilisateur. Le SUPER_ADMIN principal est intouchable et
   * seule la principale peut suspendre un autre SUPER_ADMIN.
   */
  @Patch('users/:id/block')
  async blockUser(@Param('id') id: string, @Req() req: any) {
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
      const cible = await tx.user.findUnique({
        where: { id },
        select: { id: true, email: true, role: true, estPrincipal: true, isBlocked: true },
      });
      if (!cible) throw new NotFoundException('Utilisateur introuvable.');
      verifierGestionSuperAdmin(
        cible,
        { id: req.user.id, estPrincipal: Boolean(req.user.estPrincipal) },
        'SUSPENSION',
      );
      return tx.user.update({
        where: { id },
        data: { isBlocked: true },
        select: { id: true, email: true, role: true, estPrincipal: true, isBlocked: true },
      });
    });

    await this.audit.log('USER_BLOCKED', user.id, req.user.id, {
      role: user.role,
      estPrincipal: user.estPrincipal,
      type: user.role === Role.SUPER_ADMIN ? 'SUPER_ADMIN_SUSPENDU' : 'UTILISATEUR_BLOQUE',
    });
    return { message: `Utilisateur ${user.email} bloqué avec succès.`, user };
  }

  /**
   * PATCH /admin/users/:id/unblock
   * Réactive un utilisateur, sous les mêmes règles de protection.
   */
  @Patch('users/:id/unblock')
  async unblockUser(@Param('id') id: string, @Req() req: any) {
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
      const cible = await tx.user.findUnique({
        where: { id },
        select: { id: true, email: true, role: true, estPrincipal: true, isBlocked: true },
      });
      if (!cible) throw new NotFoundException('Utilisateur introuvable.');
      verifierGestionSuperAdmin(
        cible,
        { id: req.user.id, estPrincipal: Boolean(req.user.estPrincipal) },
        'REACTIVATION',
      );
      return tx.user.update({
        where: { id },
        data: { isBlocked: false },
        select: { id: true, email: true, role: true, estPrincipal: true, isBlocked: true },
      });
    });

    await this.audit.log('USER_UNBLOCKED', user.id, req.user.id, {
      role: user.role,
      estPrincipal: user.estPrincipal,
      type: user.role === Role.SUPER_ADMIN ? 'SUPER_ADMIN_REACTIVE' : 'UTILISATEUR_DEBLOQUE',
    });
    return { message: `Utilisateur ${user.email} débloqué avec succès.`, user };
  }

  /*
   * Aucune route de promotion / rétrogradation / suppression n'existe plus :
   * les SUPER_ADMIN sont créés uniquement par le seed ou le CLI (plafond
   * vérifié en transaction), et leur statut est immuable via l'API.
   */

  /** GET /admin/tontines — liste de pilotage pour la suppression sécurisée. */
  @Get('tontines')
  async listTontines() {
    return this.prisma.tontine.findMany({
      include: {
        createur: { select: { id: true, nom: true, prenom: true, email: true } },
        _count: { select: { membres: true, transactions: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /**
   * POST /admin/tontines/:id/avertir-suppression
   * Première étape de la suppression sécurisée : on date l'avertissement et
   * on prévient le créateur et les membres. Le délai vient des paramètres
   * plateforme (ou de DELAI_AVERTISSEMENT_SUPPRESSION_JOURS), jamais du code.
   */
  @Post('tontines/:id/avertir-suppression')
  async avertirSuppression(@Param('id') id: string, @Req() req: any) {
    const tontine = await this.prisma.tontine.findUnique({
      where: { id },
      include: { membres: true },
    });
    if (!tontine) throw new NotFoundException('Tontine introuvable.');

    const delaiJours = await lireDelaiAvertissementSuppression(this.prisma);
    let dateAvertissement = tontine.suppressionDemandeeAt;
    if (!dateAvertissement) {
      dateAvertissement = new Date();
      await this.prisma.tontine.update({
        where: { id },
        data: { suppressionDemandeeAt: dateAvertissement },
      });

      const destinataires = new Set([
        tontine.createurId,
        ...tontine.membres.map((m) => m.userId),
      ]);
      for (const userId of destinataires) {
        await this.notifications.creerNotification(
          userId,
          'Avertissement de suppression',
          `La tontine « ${tontine.nom} » doit être supprimée. Aucune suppression ne sera effectuée avant ${delaiJours} jours révolus.`,
          'WARNING',
        );
      }
      await this.audit.log('TONTINE_SUPPRESSION_AVERTIE', id, req.user.id, {
        delaiJours,
        dateAvertissement,
      });
    }

    const supprimableLe = new Date(
      dateAvertissement.getTime() + delaiJours * 24 * 60 * 60 * 1000,
    );
    return { suppressionDemandeeAt: dateAvertissement, delaiJours, supprimableLe };
  }

  /**
   * POST /admin/tontines/:id/supprimer
   * Deuxième étape : délai écoulé ET aucun montant engagé (transaction réussie,
   * paiement en attente ou amende). Les données liées sont supprimées dans
   * une transaction avant la tontine elle-même (clés étrangères RESTRICT).
   */
  @Post('tontines/:id/supprimer')
  async supprimerTontine(@Param('id') id: string, @Req() req: any) {
    const tontine = await this.prisma.tontine.findUnique({
      where: { id },
      include: { membres: true },
    });
    if (!tontine) throw new NotFoundException('Tontine introuvable.');

    const delaiJours = await lireDelaiAvertissementSuppression(this.prisma);
    if (!tontine.suppressionDemandeeAt) {
      throw new BadRequestException(
        'Suppression refusée : un avertissement préalable est obligatoire.',
      );
    }
    const supprimableLe = new Date(
      tontine.suppressionDemandeeAt.getTime() + delaiJours * 24 * 60 * 60 * 1000,
    );
    if (Date.now() < supprimableLe.getTime()) {
      throw new BadRequestException(
        `Délai de ${delaiJours} jours non écoulé. Suppression possible à partir du ${supprimableLe.toISOString()}.`,
      );
    }

    const [transactions, paiementsEnAttente, amendes] = await Promise.all([
      this.prisma.transaction.count({
        where: {
          tontineId: id,
          statut: { in: [TransactionStatus.EN_ATTENTE, TransactionStatus.REUSSIE] },
        },
      }),
      this.prisma.pendingPayment.count({
        where: { tontineId: id, statut: 'EN_ATTENTE' },
      }),
      this.prisma.amendeRetard.count({ where: { tontineId: id } }),
    ]);
    if (transactions > 0 || paiementsEnAttente > 0 || amendes > 0) {
      throw new BadRequestException(
        'Suppression refusée : cette tontine a de l’argent engagé (cotisation, versement, paiement en attente ou amende).',
      );
    }

    const destinataires = new Set([
      tontine.createurId,
      ...tontine.membres.map((m) => m.userId),
    ]);
    await this.prisma.$transaction(async (tx) => {
      await tx.amendeRetard.deleteMany({ where: { tontineId: id } });
      await tx.pendingPayment.deleteMany({ where: { tontineId: id } });
      await tx.transaction.deleteMany({ where: { tontineId: id } });
      await tx.demandeAdhesion.deleteMany({ where: { tontineId: id } });
      await tx.tontineMember.deleteMany({ where: { tontineId: id } });
      await tx.tontine.delete({ where: { id } });
    });

    for (const userId of destinataires) {
      await this.notifications.creerNotification(
        userId,
        'Tontine supprimée',
        `La tontine « ${tontine.nom} » a été supprimée par l’administration de la plateforme.`,
        'WARNING',
      );
    }
    await this.audit.log('TONTINE_SUPPRIMEE', id, req.user.id, { nom: tontine.nom });

    return { message: 'Tontine supprimée.' };
  }

  /** Construit un filtre Prisma `createdAt` optionnel à partir de dates ISO. */
  private buildDateFilter(dateDebut?: string, dateFin?: string) {
    if (!dateDebut && !dateFin) return undefined;
    return {
      ...(dateDebut ? { gte: new Date(dateDebut) } : {}),
      ...(dateFin ? { lte: new Date(dateFin) } : {}),
    };
  }
}
