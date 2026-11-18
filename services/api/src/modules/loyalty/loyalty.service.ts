import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ApprovalActionType } from '../../common/enums';
import { ApprovalsService } from '../approvals/approvals.service';
import { Order } from '../orders/entities/order.entity';
import { LoyaltyAccount } from './loyalty-account.entity';
import { LoyaltyEntry, LoyaltyEntryReason } from './loyalty-entry.entity';

@Injectable()
export class LoyaltyService {
  constructor(
    @InjectRepository(LoyaltyAccount)
    private readonly accountRepo: Repository<LoyaltyAccount>,
    @InjectRepository(LoyaltyEntry)
    private readonly entryRepo: Repository<LoyaltyEntry>,
    private readonly config: ConfigService,
    private readonly approvals: ApprovalsService,
  ) {}

  private get pointsPerNaira(): number {
    return this.config.get<number>('loyalty.pointsPerNaira') ?? 0.001;
  }

  /** Called after an order reaches DELIVERED, inside the status flow. */
  async awardForDeliveredOrder(manager: EntityManager, order: Order): Promise<void> {
    const customerId = order.customer?.id;
    if (!customerId) return;
    const entryRepo = manager.getRepository(LoyaltyEntry);
    const already = await entryRepo.findOne({
      where: { orderId: order.id, reason: LoyaltyEntryReason.ORDER_DELIVERED },
    });
    if (already) return;
    const points = Math.floor(Number(order.totalAmount ?? 0) * this.pointsPerNaira);
    if (points <= 0) return;
    await this.apply(
      manager,
      customerId,
      points,
      LoyaltyEntryReason.ORDER_DELIVERED,
      order.id,
      'Delivered order',
    );
  }

  /** A returned order gives its points back, once (appendix 15). */
  async reverseForOrder(manager: EntityManager, orderId: string): Promise<void> {
    const entryRepo = manager.getRepository(LoyaltyEntry);
    const reversal = await entryRepo.findOne({
      where: { orderId, reason: LoyaltyEntryReason.RETURN_REVERSAL },
    });
    if (reversal) return;
    const award = await entryRepo.findOne({
      where: { orderId, reason: LoyaltyEntryReason.ORDER_DELIVERED },
    });
    if (!award || award.points <= 0) return;
    await this.apply(
      manager,
      award.customerId,
      -award.points,
      LoyaltyEntryReason.RETURN_REVERSAL,
      orderId,
      'Returned order',
    );
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

  /**
   * Spend points at checkout (1 point = N1). Called inside the order
   * transaction so the balance cannot be spent twice.
   */
  async redeem(manager: EntityManager, customerId: string, points: number, orderId: string) {
    if (!Number.isInteger(points) || points <= 0) return 0;
    const entryRepo = manager.getRepository(LoyaltyEntry);
    const existing = await entryRepo.findOne({
      where: { orderId, reason: LoyaltyEntryReason.REDEEMED },
    });
    if (existing) return 0;
    const accountRepo = manager.getRepository(LoyaltyAccount);
    const account = await accountRepo.findOne({ where: { customerId } });
    if (!account || account.points < points) {
      throw new BadRequestException('not enough loyalty points for this redemption');
    }
    await this.apply(
      manager,
      customerId,
      -points,
      LoyaltyEntryReason.REDEEMED,
      orderId,
      'Redeemed at checkout',
    );
    return points;
  }

  async adjust(customerId: string, points: number, note: string, approvalRequestId: string) {
    await this.approvals.assertApproved(approvalRequestId, ApprovalActionType.FUND_MOVEMENT);
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
