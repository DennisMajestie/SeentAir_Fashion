import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailAdapter } from '../auth/mail.adapter';
import { UsersModule } from '../users/users.module';
import { Notification } from './notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { TermiiAdapter } from './termii.adapter';

@Module({
  imports: [TypeOrmModule.forFeature([Notification]), UsersModule],
  controllers: [NotificationsController],
  // MailAdapter is provided here rather than imported from AuthModule: it
  // depends on nothing but ConfigService, so a local instance avoids coupling
  // notifications to auth for the sake of one stateless helper.
  providers: [NotificationsService, TermiiAdapter, MailAdapter],
  exports: [NotificationsService], // order/delivery flows notify through this
})
export class NotificationsModule {}
