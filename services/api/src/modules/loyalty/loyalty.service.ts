import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Order } from '../orders/entities/order.entity';
import { LoyaltyAccount } from './loyalty-account.entity';
import { LoyaltyEntry, LoyaltyEntryReason } from './loyalty-entry.entity';

/** One point earned per N1,000 paid, i.e. roughly 1% back on a order. */
const POINTS_PER_NAIRA = 1 / 1000;

@Injectable()
export class LoyaltyService {
  constructor(
    @InjectRepository(LoyaltyAccount)
    private readonly accountRepo: Repository<LoyaltyAccount>,
    @InjectRepository(LoyaltyEntry)
    private readonly entryRepo: Repository<LoyaltyEntry>,
  ) {}

  /** Called inside the payment transaction, just after coupons are confirmed. */
  async awardForPaidOrder(manager: EntityManager, order: Order): Promise<void> {
    const customerId = order.customer?.id;
    if (!customerId) return;
    const entryRepo = manager.getRepository(LoyaltyEntry);
    const already = await entryRepo.findOne({
      where: { orderId: order.id, reason: LoyaltyEntryReason.ORDER_PAID },
    });
    if (already) return;
    const points = Math.floor(Number(order.totalAmount ?? 0) * POINTS_PER_NAIRA);
    if (points <= 0) return;
    await this.apply(manager, customerId, points, LoyaltyEntryReason.ORDER_PAID, order.id, 'Paid order');
  }

  async wallet(customerId: string) {
    const account = await this.accountRepo.findOne({ where: { customerId } });
    const history = await this.entryRepo.find({
      where: { customerId },
      order: { createdAt: 'DESC' },
      take: 20,
    });
    return {
      points: account?.points ?? 0,
      lifetimePoints: account?.lifetimePoints ?? 0,
      history: history.map((e) => ({
        id: e.id,
        points: e.points,
        reason: e.reason,
        note: e.note,
        createdAt: e.createdAt,
      })),
    };
  }

  async accounts() {
    const accounts = await this.accountRepo.find({ order: { points: 'DESC' } });
    return accounts.map((a) => ({
      customerId: a.customerId,
      points: a.points,
      lifetimePoints: a.lifetimePoints,
    }));
  }

  async adjust(customerId: string, points: number, note: string) {
    if (!Number.isInteger(points) || points === 0) {
      throw new BadRequestException('points must be a non-zero whole number');
    }
    if (!note?.trim()) throw new BadRequestException('note is required');
    const account = await this.accountRepo.findOne({ where: { customerId } });
    const newBalance = (account?.points ?? 0) + points;
    if (newBalance < 0) throw new BadRequestException('cannot take the balance below zero');
    if (!account) throw new NotFoundException('customer has no loyalty account yet');
    await this.apply(
      this.accountRepo.manager,
      customerId,
      points,
      LoyaltyEntryReason.ADMIN_ADJUST,
      null,
      note.trim(),
    );
    return this.wallet(customerId);
  }

  private async apply(
    manager: EntityManager,
    customerId: string,
    points: number,
    reason: LoyaltyEntryReason,
    orderId: string | null,
    note: string,
  ): Promise<void> {
    const accountRepo = manager.getRepository(LoyaltyAccount);
    let account = await accountRepo.findOne({ where: { customerId } });
    if (!account) {
      account = accountRepo.create({ customerId, points: 0, lifetimePoints: 0 });
      account = await accountRepo.save(account);
    }
    await accountRepo.increment({ id: account.id }, 'points', points);
    if (points > 0) {
      await accountRepo.increment({ id: account.id }, 'lifetimePoints', points);
    }
    await manager.getRepository(LoyaltyEntry).save(
      manager.getRepository(LoyaltyEntry).create({
        customerId,
        orderId,
        points,
        reason,
        note,
      }),
    );
  }
}
