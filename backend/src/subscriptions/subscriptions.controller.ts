import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { SubscriptionsService } from './subscriptions.service';
import { ChangerPlanDto } from './dto/changer-plan.dto';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  getAbonnement(@Req() req: any) {
    return this.subscriptionsService.getAbonnement(req.user.id);
  }

  @Post('changer-plan')
  @Roles(Role.ADMIN_TONTINE, Role.SUPER_ADMIN)
  @UseGuards(RolesGuard)
  changerPlan(@Req() req: any, @Body() dto: ChangerPlanDto) {
    return this.subscriptionsService.changerPlan(req.user.id, dto.plan, req.user.role);
  }

  @Post('annuler')
  @Roles(Role.ADMIN_TONTINE, Role.SUPER_ADMIN)
  @UseGuards(RolesGuard)
  annuler(@Req() req: any) {
    return this.subscriptionsService.annulerAbonnement(req.user.id);
  }
}
