import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import {
  Notification,
  NotificationChannel,
  NotificationStatus,
} from './notification.entity';
import { TermiiAdapter } from './termii.adapter';

export interface NotifyInput {
  recipientId: string;
  type: string;
  message: string;
  relatedOrderId?: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly termii: TermiiAdapter,
    private readonly usersService: UsersService,
  ) {}

  /** In-platform notifications always land (stored in the database). */
  async notifyInPlatform(input: NotifyInput): Promise<Notification> {
    return this.notificationRepo.save(
      this.notificationRepo.create({
        recipientId: input.recipientId,
        channel: NotificationChannel.IN_PLATFORM,
        type: input.type,
        message: input.message,
        relatedOrderId: input.relatedOrderId ?? null,
        status: NotificationStatus.SENT,
      }),
    );
  }

  /**
   * SMS — specifically for delivery/location updates (appendix 09). Without
   * a configured provider the attempt is recorded as SKIPPED, never lost.
   */
  async notifySms(input: NotifyInput): Promise<Notification> {
    const notification = this.notificationRepo.create({
      recipientId: input.recipientId,
      channel: NotificationChannel.SMS,
      type: input.type,
      message: input.message,
      relatedOrderId: input.relatedOrderId ?? null,
    });
    if (!this.termii.configured) {
      notification.status = NotificationStatus.SKIPPED;
      return this.notificationRepo.save(notification);
    }
    try {
      const recipient = await this.usersService.findById(input.recipientId);
      if (!recipient.phone) {
        notification.status = NotificationStatus.FAILED;
        notification.providerRef = 'no_phone_on_record';
      } else {
        const { providerRef } = await this.termii.sendSms(recipient.phone, input.message);
        notification.status = NotificationStatus.SENT;
        notification.providerRef = providerRef;
      }
    } catch (err) {
      this.logger.warn(`SMS send failed: ${(err as Error).message}`);
      notification.status = NotificationStatus.FAILED;
    }
    return this.notificationRepo.save(notification);
  }

  /** Order-status hook used by the order/delivery flows. Never throws. */
  async onOrderStatusChange(
    customerId: string | null,
    orderId: string,
    status: string,
  ): Promise<void> {
    if (!customerId) return;
    const message = `Your Seentair order ${orderId.slice(0, 8)} is now: ${status.replace(/_/g, ' ')}`;
    try {
      await this.notifyInPlatform({
        recipientId: customerId,
        type: 'order_status',
        message,
        relatedOrderId: orderId,
      });
      // SMS is reserved for delivery/location updates (client-confirmed).
      if (status === 'shipped' || status === 'delivered') {
        await this.notifySms({
          recipientId: customerId,
          type: 'order_status',
          message,
          relatedOrderId: orderId,
        });
      }
    } catch (err) {
      this.logger.warn(`Notification failed for order ${orderId}: ${(err as Error).message}`);
    }
  }

  async listForRecipient(
    recipientId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: Notification[]; total: number }> {
    const [data, total] = await this.notificationRepo.findAndCount({
      where: { recipientId },
      order: { sentAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }
}
