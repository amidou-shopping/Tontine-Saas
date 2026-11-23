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
import { Role, TransactionType, TransactionStatus } from '@prisma/client';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard) // Authentification + vérification du rôle
@Roles(Role.SUPER_ADMIN)             // Seul le Super-Admin accède à ce contrôleur
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
   * Bloque un utilisateur (ex: fraude, cotisations impayées répétées...).
   * Un utilisateur bloqué ne peut plus se connecter (vérifié dans AuthGuard).
   */
  @Patch('users/:id/block')
  async blockUser(@Param('id') id: string, @Req() req: any) {
    const existant = await this.prisma.user.findUnique({ where: { id } });
    if (!existant) throw new NotFoundException('Utilisateur introuvable.');

    const user = await this.prisma.user.update({
      where: { id },
      data: { isBlocked: true },
      select: { id: true, email: true, isBlocked: true },
    });
    await this.audit.log('USER_BLOCKED', user.id, req.user.id);
    return { message: `Utilisateur ${user.email} bloqué avec succès.`, user };
  }

  /**
   * PATCH /admin/users/:id/unblock
   * Débloque un utilisateur précédemment suspendu.
   */
  @Patch('users/:id/unblock')
  async unblockUser(@Param('id') id: string, @Req() req: any) {
    const existant = await this.prisma.user.findUnique({ where: { id } });
    if (!existant) throw new NotFoundException('Utilisateur introuvable.');

    const user = await this.prisma.user.update({
      where: { id },
      data: { isBlocked: false },
      select: { id: true, email: true, isBlocked: true },
    });
    await this.audit.log('USER_UNBLOCKED', user.id, req.user.id);
    return { message: `Utilisateur ${user.email} débloqué avec succès.`, user };
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
