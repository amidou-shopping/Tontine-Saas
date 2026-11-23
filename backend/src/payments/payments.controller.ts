import { Controller, Post, Param, Body, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { PaymentsService } from './payments.service';

/**
 * Endpoints publics (pas de JwtAuthGuard : les providers externes n'ont pas de
 * JWT utilisateur) mais sécurisés par vérification HMAC du corps brut.
 */
@Controller('payments/webhook')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post(':provider')
  @HttpCode(HttpStatus.OK)
  recevoirWebhook(@Param('provider') provider: string, @Body() payload: any, @Req() req: any) {
    const brut = req.rawBody;
    const rawBody =
      typeof brut === 'string'
        ? brut
        : Buffer.isBuffer(brut)
          ? brut.toString('utf8')
          : JSON.stringify(payload);

    return this.paymentsService.traiterWebhook(
      provider.toUpperCase(),
      rawBody,
      req.headers as Record<string, string | string[] | undefined>,
      payload,
    );
  }
}
