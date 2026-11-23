import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis.service';
import { EmailService } from '../common/email.service';
import { RegisterDto, LoginDto, VerifyOtpDto } from './dto/auth.dto';

const SALT_ROUNDS = 12;
const OTP_TTL_SECONDS = 5 * 60; // 5 minutes
const OTP_KEY_PREFIX = 'otp:';
const RESEND_COOLDOWN_SECONDS = 60;
const RESEND_MAX_PAR_HEURE = 3;
const VERIFICATION_MAX = 5;
const VERIFICATION_FENETTE_SECONDS = 15 * 60;
const LOGIN_MAX = 5;
const LOGIN_FENETTE_SECONDS = 15 * 60;

// Nest 10 n'expose pas encore TooManyRequestsException : on utilise HttpException.
const tropDeRequetes = (message: string) => new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private redis: RedisService,
    private email: EmailService,
  ) {}

  async register(dto: RegisterDto) {
    const existant = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { telephone: dto.telephone }] },
    });
    if (existant) {
      throw new ConflictException('Un compte existe déjà avec cet email ou ce numéro.');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        telephone: dto.telephone,
        passwordHash,
        nom: dto.nom,
        prenom: dto.prenom,
      },
    });

    await this.envoyerOtp(user.id, user.email, true);

    return {
      message: 'Compte créé. Un code de vérification a été envoyé à votre adresse email.',
      userId: user.id,
    };
  }

  /** Renvoie un nouveau code OTP (utile après expiration du premier). */
  async resendOtp(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('Utilisateur introuvable.');
    if (user.isVerified) throw new BadRequestException('Cette adresse email est déjà vérifiée.');

    await this.envoyerOtp(user.id, user.email);
    return {
      message: 'Un nouveau code de vérification a été envoyé à votre adresse email.',
    };
  }

  private async envoyerOtp(userId: string, email: string, estInitial = false) {
    if (!estInitial) {
      const dernierEnvoi = await this.redis.get(`${OTP_KEY_PREFIX}last:${userId}`);
      if (dernierEnvoi && Date.now() - Number(dernierEnvoi) < RESEND_COOLDOWN_SECONDS * 1000) {
        throw tropDeRequetes(
          `Veuillez attendre ${RESEND_COOLDOWN_SECONDS} secondes avant de demander un nouveau code.`,
        );
      }

      const compteurKey = `${OTP_KEY_PREFIX}resend:${userId}`;
      const nombreDemandes = await this.redis.incr(compteurKey);
      if (nombreDemandes === 1) await this.redis.expire(compteurKey, 60 * 60);
      if (nombreDemandes > RESEND_MAX_PAR_HEURE) {
        throw tropDeRequetes('Trop de demandes de code. Réessayez dans une heure.');
      }
    }

    const code = String(randomInt(100000, 1000000)); // 6 chiffres, source cryptographique
    await this.redis.setex(`${OTP_KEY_PREFIX}${userId}`, OTP_TTL_SECONDS, code);
    await this.redis.setex(
      `${OTP_KEY_PREFIX}last:${userId}`,
      RESEND_COOLDOWN_SECONDS,
      String(Date.now()),
    );

    // Envoi réel si un SMTP est configuré, sinon code affiché dans les logs en dev.
    await this.email.envoyerCodeVerification(email, code);
  }

  async verifierOtp(dto: VerifyOtpDto) {
    const tentativeKey = `${OTP_KEY_PREFIX}attempts:${dto.userId}`;
    const tentatives = await this.redis.incr(tentativeKey);
    if (tentatives === 1) await this.redis.expire(tentativeKey, VERIFICATION_FENETTE_SECONDS);
    if (tentatives > VERIFICATION_MAX) {
      throw tropDeRequetes('Trop de tentatives incorrectes. Demandez un nouveau code.');
    }

    const key = `${OTP_KEY_PREFIX}${dto.userId}`;
    const code = await this.redis.get(key);

    if (!code) {
      throw new BadRequestException('Code expiré ou introuvable. Demandez un nouveau code.');
    }
    if (code !== dto.code) {
      throw new BadRequestException('Code incorrect.');
    }

    // Supprime le code et les compteurs après vérification réussie
    await this.redis.del(key);
    await this.redis.del(tentativeKey);
    await this.redis.del(`${OTP_KEY_PREFIX}resend:${dto.userId}`);

    const user = await this.prisma.user.update({
      where: { id: dto.userId },
      data: { isVerified: true },
    });

    return { message: 'Adresse email vérifiée avec succès.', userId: user.id };
  }

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase().trim();
    const tentativeKey = `login:attempts:${email}`;
    const tentatives = await this.redis.incr(tentativeKey);
    if (tentatives === 1) await this.redis.expire(tentativeKey, LOGIN_FENETTE_SECONDS);
    if (tentatives > LOGIN_MAX) {
      throw tropDeRequetes('Trop de tentatives de connexion. Réessayez dans 15 minutes.');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    const motDePasseValide = user
      ? await bcrypt.compare(dto.password, user.passwordHash)
      : // Compare quand même pour ne pas révéler l'existence du compte (timing)
        await bcrypt.compare(dto.password, '$2b$12$C6UzMDM.H6dfI/f/IKcEe.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

    if (!user || !motDePasseValide) throw new UnauthorizedException('Identifiants invalides.');

    if (user.isBlocked) throw new UnauthorizedException('Compte suspendu. Contactez le support.');
    if (!user.isVerified) throw new UnauthorizedException("Veuillez d'abord vérifier votre adresse email.");

    await this.redis.del(tentativeKey);

    const token = this.jwtService.sign({ sub: user.id, role: user.role });

    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        telephone: user.telephone,
        nom: user.nom,
        prenom: user.prenom,
        role: user.role,
      },
    };
  }
}
