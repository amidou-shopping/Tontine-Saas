import { IsString, Length } from 'class-validator';

export class RejoindreParCodeDto {
  @IsString()
  @Length(4, 20, { message: 'Code d\'invitation invalide.' })
  codeInvitation: string;
}

export class AjouterMembreDto {
  @IsString()
  userId: string;
}
