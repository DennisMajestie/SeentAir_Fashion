import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { Notification, NotificationChannel, NotificationStatus } from './notification.entity';
import { MailAdapter } from '../auth/mail.adapter';
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
    private readonly mailAdapter: MailAdapter,
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

  /**
   * The guest's copy of their own order. This is the durable route to it: the
   * Paystack callback only returns the browser, and browsers get closed, so a
   * guest who never receives this has paid and has no way back to their order.
   * Never throws — a mail failure must not roll back a paid order.
   */
  async sendGuestOrderConfirmation(input: {
    email: string;
    name: string | null;
    orderId: string;
    totalAmount: number;
    trackingUrl: string;
  }): Promise<void> {
    const ref = input.orderId.slice(0, 8);
    try {
      await this.mailAdapter.send(
        input.email,
        `Your Seentair order ${ref} is confirmed`,
        [
          `${input.name ? `Hi ${input.name},` : 'Hi,'}`,
          '',
          `We have your payment and your order is confirmed. Reference ${ref}.`,
          `Total paid: ${input.totalAmount}.`,
          '',
          `Track it here, no account needed: ${input.trackingUrl}`,
          '',
          'Keep this link — it is how you follow your delivery. Create an account with',
          'this email address at any time and this order moves into your order history.',
        ].join('\n'),
      );
    } catch (err) {
      this.logger.warn(
        `Guest confirmation email failed for order ${input.orderId}: ${(err as Error).message}`,
      );
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
