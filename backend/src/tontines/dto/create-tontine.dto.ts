import { IsString, IsInt, IsPositive, IsEnum, IsOptional, Min, Max } from 'class-validator';
import { TontineType, TontineFrequency } from '@prisma/client';

export class CreateTontineDto {
  @IsString()
  nom: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TontineType)
  type?: TontineType; // Optionnel : CLASSIQUE par défaut

  @IsPositive()
  montantCotisation: number;

  @IsEnum(TontineFrequency)
  frequence: TontineFrequency;

  @IsInt()
  @Min(2, { message: 'Une tontine doit compter au moins 2 membres.' })
  @Max(100)
  nombreMaxMembres: number;

  @IsOptional()
  @Min(0)
  @Max(0.2)
  tauxCommission?: number; // Optionnel : sinon la valeur par défaut du schéma (1.5%) s'applique
}
