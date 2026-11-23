import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

/**
 * Envoi des emails transactionnels (pour l'instant : code de vérification).
 *
 * Si SMTP_HOST/SMTP_USER/SMTP_PASS sont définis, l'email est réellement envoyé.
 * Sinon (développement), le code est affiché dans les logs du backend, comme
 * c'était le cas pour les SMS simulés.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter | null;
  private readonly expediteur: string;

  constructor(private config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    const utilisateur = config.get<string>('SMTP_USER');
    const motDePasse = config.get<string>('SMTP_PASS');

    if (host && utilisateur && motDePasse) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(config.get('SMTP_PORT') ?? 587),
        secure: config.get('SMTP_SECURE') === 'true',
        auth: { user: utilisateur, pass: motDePasse },
      });
      this.expediteur = config.get<string>('MAIL_FROM') ?? utilisateur;
    } else {
      this.transporter = null;
      this.expediteur = config.get<string>('MAIL_FROM') ?? 'no-reply@tontine.local';
    }
  }

  get estConfigure(): boolean {
    return this.transporter !== null;
  }

  /** Envoie le code OTP à l'adresse email du créateur de compte. */
  async envoyerCodeVerification(email: string, code: string): Promise<void> {
    const objet = 'Votre code de vérification Tontine SaaS';
    const texte =
      `Bonjour,\n\n` +
      `Votre code de vérification est : ${code}\n` +
      `Il est valable 5 minutes.\n\n` +
      `Si vous n'êtes pas à l'origine de cette inscription, ignorez cet email.\n`;

    if (!this.transporter) {
      this.logger.log(`[EMAIL SIMULÉ] Envoi du code ${code} à ${email}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.expediteur,
        to: email,
        subject: objet,
        text: texte,
      });
      this.logger.log(`Code de vérification envoyé à ${email}`);
    } catch (erreur) {
      const message = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(`Échec de l'envoi du code à ${email} : ${message}`);
      throw new InternalServerErrorException(
        "Impossible d'envoyer le code de vérification. Réessayez plus tard.",
      );
    }
  }
}
