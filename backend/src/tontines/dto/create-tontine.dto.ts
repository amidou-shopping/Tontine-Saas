import { IsString, IsInt, IsPositive, IsEnum, IsOptional, Min, Max } from 'class-validator';
import { TontineType, JourSemaine } from '@prisma/client';

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

  // Les cotisations sont hebdomadaires : on choisit le jour, pas une fréquence
  // ni un nombre de jours. Le tour 1 a lieu au prochain `jourCotisation`.
  @IsEnum(JourSemaine, { message: 'Jour de cotisation invalide (LUNDI à DIMANCHE attendu).' })
  jourCotisation: JourSemaine;

  @IsInt()
  @Min(2, { message: 'Une tontine doit compter au moins 2 membres.' })
  @Max(100)
  nombreMaxMembres: number;
  // Le taux de commission n'est plus choisi par le créateur : il vient de
  // ParametresPlateforme (3% par défaut, surchargeable par environnement).
}
