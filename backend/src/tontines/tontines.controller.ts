import { Body, Controller, Get, Param, Post, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { TontinesService } from './tontines.service';
import { CreateTontineDto } from './dto/create-tontine.dto';
import { AjouterMembreDto, RejoindreParCodeDto } from './dto/tontine-actions.dto';

@Controller('tontines')
@UseGuards(JwtAuthGuard) // Toute personne connectée peut créer/rejoindre (sous réserve de son abonnement)
export class TontinesController {
  constructor(private readonly tontinesService: TontinesService) {}

  @Get()
  lister() {
    return this.tontinesService.lister();
  }

  @Get('admin/mes-tontines')
  @Roles(Role.ADMIN_TONTINE, Role.SUPER_ADMIN)
  @UseGuards(RolesGuard)
  mesTontines(@Req() req: any) {
    return this.tontinesService.mesTontinesAdmin(req.user.id);
  }

  @Post()
  creer(@Body() dto: CreateTontineDto, @Req() req: any) {
    return this.tontinesService.creer(req.user.id, dto);
  }

  @Post('rejoindre-par-code')
  rejoindreParCode(@Body() dto: RejoindreParCodeDto, @Req() req: any) {
    return this.tontinesService.rejoindreParCode(dto.codeInvitation, req.user.id);
  }

  @Post(':id/rejoindre')
  rejoindre(@Param('id') id: string, @Req() req: any) {
    return this.tontinesService.rejoindre(id, req.user.id);
  }

  @Post(':id/demarrer')
  @Roles(Role.ADMIN_TONTINE, Role.SUPER_ADMIN)
  @UseGuards(RolesGuard)
  demarrer(@Param('id') id: string, @Req() req: any) {
    return this.tontinesService.demarrer(id, req.user.id, req.user.role === Role.SUPER_ADMIN);
  }

  @Post(':id/ajouter-membre')
  @Roles(Role.ADMIN_TONTINE, Role.SUPER_ADMIN)
  @UseGuards(RolesGuard)
  ajouterMembre(@Param('id') id: string, @Body() dto: AjouterMembreDto, @Req() req: any) {
    return this.tontinesService.ajouterMembre(
      id,
      dto.userId,
      req.user.id,
      req.user.role === Role.SUPER_ADMIN,
    );
  }

  @Get(':id/membres-recherchables')
  @Roles(Role.ADMIN_TONTINE, Role.SUPER_ADMIN)
  @UseGuards(RolesGuard)
  rechercherMembres(@Param('id') id: string, @Query('q') q: string, @Req() req: any) {
    return this.tontinesService.rechercherMembres(
      id,
      q ?? '',
      req.user.id,
      req.user.role === Role.SUPER_ADMIN,
    );
  }
}
