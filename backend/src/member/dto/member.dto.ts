import { IsEnum, IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';
import { PaymentProvider } from '@prisma/client';

export class PayerCotisationDto {
  @IsEnum(PaymentProvider, { message: 'Provider de paiement invalide.' })
  provider: PaymentProvider;

  // Cycle à régler. Omitted = cotisation du cycle en cours ; renseigné avec le
  // cycle précédent = règlement d'un arriéré (cotisation + amende).
  @IsOptional()
  @IsInt()
  @Min(1)
  cycleConcerne?: number;
}

export class UpdateProfilDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  nom?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  prenom?: string;

  @IsOptional()
  @Matches(/^\+221[0-9]{9}$/, { message: 'Numéro sénégalais requis, format +221XXXXXXXXX.' })
  telephone?: string;
}
