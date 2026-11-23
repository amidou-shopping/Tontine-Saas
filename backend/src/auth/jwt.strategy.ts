import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Décode le JWT, puis recharge l'utilisateur en base à chaque requête pour
 * s'assurer que son rôle et son statut isBlocked sont à jour (et non figés
 * dans le token, qui pourrait devenir obsolète entre deux connexions).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET doit être défini dans la configuration (backend/.env).');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: { sub: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return null;
    if (user.isBlocked) throw new UnauthorizedException('Compte suspendu. Contactez le support.');
    // Ce qui est retourné ici devient req.user dans les contrôleurs/guards
    return user;
  }
}
