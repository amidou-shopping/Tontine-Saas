import { IsEnum } from 'class-validator';
import { PlanAbonnement } from '@prisma/client';

export class ChangerPlanDto {
  @IsEnum(PlanAbonnement, { message: 'Plan d\'abonnement invalide.' })
  plan: PlanAbonnement;
}
