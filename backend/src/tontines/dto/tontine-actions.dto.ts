import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class RejoindreParCodeDto {
  @IsString()
  @Length(4, 20, { message: 'Code d\'invitation invalide.' })
  codeInvitation: string;
}

export class AjouterMembreDto {
  @IsString()
  userId: string;
}

/** Motif facultatif lors du refus d'une demande d'adhésion. */
export class RepondreDemandeDto {
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Le motif ne doit pas dépasser 300 caractères.' })
  motifRefus?: string;
}
