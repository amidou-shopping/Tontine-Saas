import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Décorateur utilisé sur un contrôleur ou une méthode pour restreindre
 * l'accès à certains rôles. Ex: @Roles(Role.SUPER_ADMIN)
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
