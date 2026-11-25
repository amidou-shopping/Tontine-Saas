import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { estApresDelaiGrace } from '../common/finances.util';
import { dateDuTour, demainUTC, minuitUTC } from '../common/dates.util';
import { lireParametresFinanciers } from '../common/parametres-financiers';
import { MemberStatus, TontineStatus, TransactionStatus, TransactionType } from '@prisma/client';

type MomentRappel = 'veille' | 'jour' | 'retard';

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
    lien?: string | null,
  ) {
    return this.prisma.notification.create({
      data: { userId, titre, message, type, lien: lien ?? null },
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
   * Tourne chaque jour à 8h (UTC). Pour chaque tontine active, on utilise
   * l'échéance du tour en cours (dateDuTour) pour :
   *   - prévenir la veille de la cotisation ;
   *   - prévenir le jour même ;
   *   - qualifier le retard après le délai de grâce et marquer EN_RETARD.
   * Les rappels sont idempotents : un même rappel n'est jamais dupliqué.
   */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async verifierEcheancesEtRelancer(maintenant = new Date()) {
    this.logger.log('Vérification quotidienne des échéances de cotisation...');

    const tontinesActives = await this.prisma.tontine.findMany({
      where: { statut: TontineStatus.ACTIVE },
      include: { membres: { where: { statut: { in: [MemberStatus.ACTIF, MemberStatus.EN_RETARD] } } } },
    });
    const parametres = await lireParametresFinanciers(this.prisma);
    const aujourdHui = minuitUTC(maintenant);
    const demain = demainUTC(maintenant);

    for (const tontine of tontinesActives) {
      const echeance = dateDuTour(
        tontine.dateDebut ?? tontine.createdAt,
        tontine.cycleActuel,
      );
      const jourEcheance = minuitUTC(echeance);
      const estVeille = jourEcheance.getTime() === demain.getTime();
      const estJourMeme = jourEcheance.getTime() === aujourdHui.getTime();

      for (const membre of tontine.membres) {
        const aPaye = await this.prisma.transaction.findFirst({
          where: {
            tontineMemberId: membre.id,
            type: TransactionType.COTISATION,
            statut: TransactionStatus.REUSSIE,
            cycleConcerne: tontine.cycleActuel,
          },
        });
        if (aPaye) continue;

        if (estVeille) await this.envoyerRappel(membre.userId, tontine.nom, tontine.cycleActuel, 'veille');
        if (estJourMeme) await this.envoyerRappel(membre.userId, tontine.nom, tontine.cycleActuel, 'jour');

        // L'amende n'est créée qu'au règlement de l'arriéré (une seule fois).
        if (
          estApresDelaiGrace(echeance, maintenant, parametres.delaiGraceHeures) &&
          membre.statut !== MemberStatus.EN_RETARD
        ) {
          await this.prisma.tontineMember.update({
            where: { id: membre.id },
            data: { statut: MemberStatus.EN_RETARD },
          });
          await this.envoyerRappel(membre.userId, tontine.nom, tontine.cycleActuel, 'retard');
        }
      }
    }
  }

  /** Rappel idempotent (in-app + log du SMS simulé). */
  private async envoyerRappel(
    userId: string,
    nomTontine: string,
    cycle: number,
    moment: MomentRappel,
  ) {
    const contenus = {
      veille: {
        titre: 'Cotisation demain',
        message: `Rappel : votre cotisation pour « ${nomTontine} » (tour ${cycle}) est due demain.`,
        type: 'INFO',
      },
      jour: {
        titre: 'Cotisation aujourd’hui',
        message: `Votre cotisation pour « ${nomTontine} » (tour ${cycle}) est due aujourd’hui.`,
        type: 'INFO',
      },
      retard: {
        titre: 'Cotisation en retard',
        message: `Votre cotisation pour « ${nomTontine} » (tour ${cycle}) est en attente. Merci de régulariser votre situation.`,
        type: 'WARNING',
      },
    } as const;

    const { titre, message, type } = contenus[moment];
    const dejaEnvoye = await this.prisma.notification.findFirst({
      where: { userId, titre, message },
      select: { id: true },
    });
    if (dejaEnvoye) return;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    await this.creerNotification(userId, titre, message, type);

    // TODO: brancher un vrai fournisseur SMS/WhatsApp (Twilio, agrégateur local).
    this.logger.log(
      `[RAPPEL SIMULÉ] SMS envoyé à ${user.telephone} : ${titre} — ${nomTontine} (tour ${cycle}).`,
    );
  }
}
