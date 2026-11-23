import { IsEmail, IsString, MinLength, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Email invalide.' })
  email: string;

  @Matches(/^\+221[0-9]{9}$/, { message: 'Numéro sénégalais requis, format +221XXXXXXXXX.' })
  telephone: string;

  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères.' })
  password: string;

  @IsString()
  nom: string;

  @IsString()
  prenom: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

export class VerifyOtpDto {
  @IsString()
  userId: string;

  @Matches(/^[0-9]{6}$/, { message: "Le code OTP doit contenir 6 chiffres." })
  code: string;
}
