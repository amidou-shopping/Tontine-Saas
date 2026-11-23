import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MemberStatus, TontineStatus, TransactionStatus, TransactionType } from '@prisma/client';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  /** Crée une notification in-app (source de vérité pour l'UI et le cron). */
  async creerNotification(
    userId: string,
    titre: string,
    message: string,
    type = 'INFO',
  ) {
    return this.prisma.notification.create({
      data: { userId, titre, message, type },
    });
  }

  /** Notification envoyée au bénéficiaire lorsque sa cagnotte est versée. */
  async notifierVersement(userId: string, nomTontine: string, montant: number, cycle: number) {
    return this.creerNotification(
      userId,
      'Cagnotte reçue',
      `Votre tour est arrivé dans « ${nomTontine} » (cycle ${cycle}) : ${montant.toLocaleString('fr-FR')} FCFA vous ont été versés.`,
      'SUCCESS',
    );
  }

  /**
   * Tourne chaque jour à 8h : pour chaque tontine active, identifie les
   * membres n'ayant pas encore cotisé pour le cycle en cours et les marque
   * EN_RETARD, puis crée une notification in-app et un rappel SMS simulé.
   */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async verifierEcheancesEtRelancer() {
    this.logger.log('Vérification quotidienne des échéances de cotisation...');

    const tontinesActives = await this.prisma.tontine.findMany({
      where: { statut: TontineStatus.ACTIVE },
      include: { membres: { where: { statut: { in: [MemberStatus.ACTIF, MemberStatus.EN_RETARD] } } } },
    });

    for (const tontine of tontinesActives) {
      for (const membre of tontine.membres) {
        const aPaye = await this.prisma.transaction.findFirst({
          where: {
            tontineMemberId: membre.id,
            type: TransactionType.COTISATION,
            statut: TransactionStatus.REUSSIE,
            cycleConcerne: tontine.cycleActuel,
          },
        });

        // On ne notifie qu'au passage en retard, pour éviter un spam quotidien.
        if (!aPaye && membre.statut !== MemberStatus.EN_RETARD) {
          await this.prisma.tontineMember.update({
            where: { id: membre.id },
            data: { statut: MemberStatus.EN_RETARD },
          });
          await this.envoyerRappel(membre.userId, tontine.nom, tontine.cycleActuel);
        }
      }
    }
  }

  private async envoyerRappel(userId: string, nomTontine: string, cycle: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    await this.creerNotification(
      userId,
      'Cotisation en retard',
      `Votre cotisation pour « ${nomTontine} » (cycle ${cycle}) est en attente. Merci de régulariser votre situation.`,
      'WARNING',
    );

    // TODO: brancher un vrai fournisseur SMS/WhatsApp (Twilio, agrégateur local)
    this.logger.log(`[RAPPEL SIMULÉ] SMS envoyé à ${user.telephone} : cotisation "${nomTontine}" en attente.`);
  }
}
