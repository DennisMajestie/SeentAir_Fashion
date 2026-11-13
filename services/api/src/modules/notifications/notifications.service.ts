import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { Notification, NotificationChannel, NotificationStatus } from './notification.entity';
import { NotificationPreference } from './notification-preference.entity';
import { MailAdapter } from '../auth/mail.adapter';
import { TermiiAdapter } from './termii.adapter';

export interface NotifyInput {
  recipientId: string;
  type: string;
  message: string;
  relatedOrderId?: string | null;
  /** Preference key checked against the recipient's saved switches (defaults to type). */
  preferenceKey?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationPreference)
    private readonly preferenceRepo: Repository<NotificationPreference>,
    private readonly termii: TermiiAdapter,
    private readonly usersService: UsersService,
    private readonly mailAdapter: MailAdapter,
  ) {}

  async getPreferences(userId: string): Promise<Record<string, boolean>> {
    const row = await this.preferenceRepo.findOne({ where: { userId } });
    return row?.preferences ?? {};
  }

  /** A missing preference means the user wants the notification (default on). */
  private preferenceAllows(preferences: Record<string, boolean>, key: string): boolean {
    return preferences[key] ?? true;
  }

  async updatePreferences(
    userId: string,
    preferences: Record<string, boolean>,
  ): Promise<Record<string, boolean>> {
    const current = await this.getPreferences(userId);
    const merged = { ...current };
    for (const [key, value] of Object.entries(preferences)) {
      if (typeof value === 'boolean') merged[key] = value;
    }
    let row = await this.preferenceRepo.findOne({ where: { userId } });
    if (!row) {
      row = this.preferenceRepo.create({ userId, preferences: merged });
    } else {
      row.preferences = merged;
    }
    await this.preferenceRepo.save(row);
    return merged;
  }

  /** In-platform notifications always land (stored in the database) — unless the
   *  recipient turned this notification type off. */
  async notifyInPlatform(input: NotifyInput): Promise<Notification | null> {
    const prefs = await this.getPreferences(input.recipientId);
    if (!this.preferenceAllows(prefs, input.preferenceKey ?? input.type)) {
      return null;
    }
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
    const prefs = await this.getPreferences(input.recipientId);
    const typeKey = input.preferenceKey ?? input.type;
    if (
      !this.preferenceAllows(prefs, typeKey) ||
      !this.preferenceAllows(prefs, 'channelSms')
    ) {
      notification.status = NotificationStatus.SKIPPED;
      notification.providerRef = 'user_preferences';
      return this.notificationRepo.save(notification);
    }
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
    const preferenceKey =
      status === 'shipped' || status === 'delivered' ? 'orderShipped' : 'newOrder';
    try {
      await this.notifyInPlatform({
        recipientId: customerId,
        type: 'order_status',
        message,
        relatedOrderId: orderId,
        preferenceKey,
      });
      // SMS is reserved for delivery/location updates (client-confirmed).
      if (status === 'shipped' || status === 'delivered') {
        await this.notifySms({
          recipientId: customerId,
          type: 'order_status',
          message,
          relatedOrderId: orderId,
          preferenceKey,
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
    // Persisted GET behavior: reading your notifications marks them as read.
    const now = new Date();
    for (const n of data) {
      if (!n.readAt) n.readAt = now;
    }
    if (data.length) await this.notificationRepo.save(data);
    return { data, total };
  }

  async markRead(id: string, recipientId: string): Promise<Notification> {
    const notification = await this.notificationRepo.findOne({ where: { id, recipientId } });
    if (!notification) {
      throw new NotFoundException(`Notification ${id} not found`);
    }
    notification.readAt = new Date();
    return this.notificationRepo.save(notification);
  }
}
