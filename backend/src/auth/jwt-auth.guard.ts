import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Vérifie la présence et la validité du JWT (stratégie 'jwt' définie dans
 * auth.module.ts). Bloque également les comptes désactivés (isBlocked).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Session invalide, veuillez vous reconnecter.');
    }
    if (user.isBlocked) {
      throw new UnauthorizedException('Votre compte a été suspendu. Contactez le support.');
    }
    return user;
  }
}
