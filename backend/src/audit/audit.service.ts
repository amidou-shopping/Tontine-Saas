import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Centralise l'écriture des logs d'audit pour toutes les actions sensibles
 * du back-office (blocage utilisateur, suspension de tontine, etc.).
 */
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(action: string, cible: string, acteurId: string, details?: Record<string, unknown>) {
    await this.prisma.auditLog.create({
      data: {
        action,
        cible,
        acteurId,
        details: details ? JSON.stringify(details) : undefined,
      },
    });
  }
}
