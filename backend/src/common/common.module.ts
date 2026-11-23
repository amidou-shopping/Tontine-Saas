import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from './redis.service';
import { EmailService } from './email.service';
import { AuditService } from '../audit/audit.service';

/**
 * Services techniques partagés par toute l'application.
 *
 * `PrismaService`, `RedisService` et `AuditService` sont fournis une seule fois
 * et injectés dans tous les modules (plus de PrismaClient dupliqué par module).
 */
@Global()
@Module({
  providers: [PrismaService, RedisService, EmailService, AuditService],
  exports: [PrismaService, RedisService, EmailService, AuditService],
})
export class CommonModule {}
