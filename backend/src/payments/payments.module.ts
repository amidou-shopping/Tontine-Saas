import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { WaveProvider } from './providers/wave.provider';
import { OrangeMoneyProvider } from './providers/orange-money.provider';
import { PaytechProvider } from './providers/paytech.provider';
import { TontinesModule } from '../tontines/tontines.module';

@Module({
  imports: [TontinesModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, WaveProvider, OrangeMoneyProvider, PaytechProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}
