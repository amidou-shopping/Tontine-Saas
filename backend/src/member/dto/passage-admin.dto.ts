import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaymentProvider } from '@prisma/client';

/** Initiation du paiement unique MEMBER -> ADMIN_TONTINE. */
export class InitierPassageAdminDto {
  @IsEnum(PaymentProvider, { message: 'Provider de paiement invalide.' })
  provider: PaymentProvider;

  @IsOptional()
  @IsString()
  telephone?: string;
}

/** Confirmation simulée du paiement (même sortie que le webhook réel). */
export class ConfirmerPassageAdminDto {
  @IsString()
  referenceInterne: string;
}
