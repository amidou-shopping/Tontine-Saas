import { Module } from '@nestjs/common';
import { MemberController } from './member.controller';
import { PaymentsModule } from '../payments/payments.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PaymentsModule, AuthModule],
  controllers: [MemberController],
})
export class MemberModule {}
