import { Module } from '@nestjs/common';
import { MemberController } from './member.controller';
import { PaymentsModule } from '../payments/payments.module';
import { AuthModule } from '../auth/auth.module';
import { TontinesModule } from '../tontines/tontines.module';

@Module({
  imports: [PaymentsModule, AuthModule, TontinesModule],
  controllers: [MemberController],
})
export class MemberModule {}
