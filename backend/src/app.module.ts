import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { TontinesModule } from './tontines/tontines.module';
import { PaymentsModule } from './payments/payments.module';
import { MemberModule } from './member/member.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // Charge le .env dans process.env
    ScheduleModule.forRoot(),                 // Active les tâches @Cron
    CommonModule,                             // Prisma / Redis / Audit : une seule instance
    AuthModule,
    AdminModule,
    TontinesModule,
    PaymentsModule,
    MemberModule,
    NotificationsModule,
    SubscriptionsModule,
  ],
})
export class AppModule {}
