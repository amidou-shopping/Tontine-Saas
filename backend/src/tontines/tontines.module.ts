import { Module } from '@nestjs/common';
import { TontinesController } from './tontines.controller';
import { TontinesService } from './tontines.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [SubscriptionsModule, NotificationsModule],
  controllers: [TontinesController],
  providers: [TontinesService],
  exports: [TontinesService],
})
export class TontinesModule {}
