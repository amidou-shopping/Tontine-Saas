import {
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Body,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { TontineFrequency, TontineStatus, TransactionStatus, TransactionType } from '@prisma/client';
import { PayerCotisationDto, UpdateProfilDto } from './dto/member.dto';

@Controller('member')
@UseGuards(JwtAuthGuard)
export class MemberController {
  constructor(
    private prisma: PrismaService,
    private paymentsService: PaymentsService,
  ) {}

  /**
   * GET /member/tontines
   * Alimente le dashboard membre : tour, cycle en cours et état de la cotisation.
   */
  @Get('tontines')
  async mesTontines(@Req() req: any) {
    const membres = await this.prisma.tontineMember.findMany({
      where: { userId: req.user.id, tontine: { statut: TontineStatus.ACTIVE } },
      include: { tontine: true },
    });

    return Promise.all(
      membres.map(async (m) => {
        const cotisationPayee = await this.prisma.transaction.findFirst({
          where: {
            tontineMemberId: m.id,
            type: TransactionType.COTISATION,
            statut: TransactionStatus.REUSSIE,
            cycleConcerne: m.tontine.cycleActuel,
          },
        });

        return {
          id: m.tontine.id,
          nom: m.tontine.nom,
          description: m.tontine.description,
          montantCotisation: Number(m.tontine.montantCotisation),
          frequence: m.tontine.frequence,
          prochainEcheance: this.calculerProchaineEcheance(
            m.tontine.dateDebut,
            m.tontine.frequence,
            m.tontine.cycleActuel,
          ),
          monTour: m.ordrePassage,
          cycleActuel: m.tontine.cycleActuel,
          statutCotisation: cotisationPayee ? 'PAYE' : 'EN_ATTENTE',
          codeInvitation: m.tontine.codeInvitation,
        };
      }),
    );
  }

  /** GET /member/tontines/:id — détail (membres + transactions). */
  @Get('tontines/:id')
  async detailTontine(@Param('id') id: string, @Req() req: any) {
    const tontine = await this.prisma.tontine.findUnique({
      where: { id },
      include: {
        createur: { select: { id: true, nom: true, prenom: true, email: true, telephone: true } },
        membres: {
          include: { user: { select: { id: true, nom: true, prenom: true, email: true, telephone: true } } },
          orderBy: { ordrePassage: 'asc' },
        },
        transactions: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });

    if (!tontine) throw new NotFoundException('Tontine introuvable.');
    if (!tontine.membres.some((m) => m.userId === req.user.id)) {
      throw new ForbiddenException("Vous n'êtes pas membre de cette tontine.");
    }

    return tontine;
  }

  /** GET /member/transactions — historique de l'utilisateur connecté. */
  @Get('transactions')
  async mesTransactions(@Req() req: any) {
    const transactions = await this.prisma.transaction.findMany({
      where: { userId: req.user.id },
      include: {
        tontine: { select: { id: true, nom: true } },
        tontineMember: { select: { ordrePassage: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return transactions.map((t) => ({
      id: t.id,
      type: t.type,
      statut: t.statut,
      montantBrut: Number(t.montantBrut),
      montantCommission: Number(t.montantCommission),
      montantNet: Number(t.montantNet),
      provider: t.provider,
      referenceExterne: t.referenceExterne,
      cycleConcerne: t.cycleConcerne,
      tontineId: t.tontineId,
      tontineNom: t.tontine?.nom,
      createdAt: t.createdAt,
    }));
  }

  /** GET /member/profil */
  @Get('profil')
  async getProfil(@Req() req: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        telephone: true,
        nom: true,
        prenom: true,
        role: true,
        isVerified: true,
        avatarUrl: true,
        createdAt: true,
        abonnement: true,
      },
    });

    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    return {
      ...user,
      abonnement: user.abonnement
        ? { ...user.abonnement, prixMensuel: Number(user.abonnement.prixMensuel) }
        : null,
    };
  }

  /** PATCH /member/profil */
  @Patch('profil')
  async updateProfil(@Req() req: any, @Body() dto: UpdateProfilDto) {
    const utilisateur = await this.prisma.user.findUnique({ where: { id: req.user.id } });
    if (!utilisateur) throw new NotFoundException('Utilisateur introuvable.');

    const numeroChange = Boolean(dto.telephone && dto.telephone !== utilisateur.telephone);
    if (numeroChange) {
      const conflit = await this.prisma.user.findUnique({ where: { telephone: dto.telephone } });
      if (conflit) throw new ConflictException('Ce numéro de téléphone est déjà utilisé.');
    }

    let user;
    try {
      user = await this.prisma.user.update({
        where: { id: req.user.id },
        data: {
          ...(dto.nom && { nom: dto.nom }),
          ...(dto.prenom && { prenom: dto.prenom }),
          ...(dto.telephone && { telephone: dto.telephone }),
        },
        select: {
          id: true,
          email: true,
          telephone: true,
          nom: true,
          prenom: true,
          role: true,
          isVerified: true,
          avatarUrl: true,
        },
      });
    } catch (erreur) {
      if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === 'P2002') {
        throw new ConflictException('Ce numéro de téléphone est déjà utilisé.');
      }
      throw erreur;
    }

    // La vérification OTP porte sur l'email : changer de numéro ne la réinitialise pas.
    return { message: 'Profil mis à jour.', user };
  }

  /** GET /member/notifications */
  @Get('notifications')
  async mesNotifications(@Req() req: any) {
    return this.prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** POST /member/notifications/:id/lu */
  @Post('notifications/:id/lu')
  async marquerLue(@Param('id') id: string, @Req() req: any) {
    const resultat = await this.prisma.notification.updateMany({
      where: { id, userId: req.user.id },
      data: { lue: true },
    });
    if (resultat.count === 0) throw new NotFoundException('Notification introuvable.');
    return { message: 'Notification marquée comme lue.', count: resultat.count };
  }

  /** POST /member/tontines/:id/payer */
  @Post('tontines/:id/payer')
  async payerCotisation(
    @Param('id') tontineId: string,
    @Body() dto: PayerCotisationDto,
    @Req() req: any,
  ) {
    return this.paymentsService.payerCotisationSimule(
      tontineId,
      req.user.id,
      dto.provider,
      req.user.telephone,
    );
  }

  private calculerProchaineEcheance(
    dateDebut: Date | null,
    frequence: TontineFrequency,
    cycleActuel: number,
  ): Date {
    const echeance = new Date(dateDebut ?? Date.now());
    for (let tour = 1; tour < Math.max(1, cycleActuel); tour++) {
      this.ajouterPeriode(echeance, frequence);
    }
    // S'il y a eu du retard, on affiche toujours la prochaine échéance future.
    while (echeance.getTime() <= Date.now()) this.ajouterPeriode(echeance, frequence);
    return echeance;
  }

  private ajouterPeriode(date: Date, frequence: TontineFrequency) {
    if (frequence === TontineFrequency.QUOTIDIENNE) date.setDate(date.getDate() + 1);
    else if (frequence === TontineFrequency.HEBDOMADAIRE) date.setDate(date.getDate() + 7);
    else date.setMonth(date.getMonth() + 1);
  }
}
