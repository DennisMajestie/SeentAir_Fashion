import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { In, DataSource, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../../common/interfaces';
import { RoleName } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { Conversation, ConversationChannel, ConversationStatus } from './conversation.entity';
import { Message, MessageDirection } from './message.entity';
import { MessagingBus } from './messaging-bus';
import { WhatsAppAdapter } from './whatsapp.adapter';
import {
  ConversationsQueryDto,
  CreateConversationDto,
  CreateGuestConversationDto,
} from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

/** Roles that operate the inbox. Mirrors the realtime gateway's admin set. */
const STAFF_ROLES = new Set<RoleName>([
  RoleName.BUSINESS_OWNER_ADMIN,
  RoleName.MANAGEMENT,
  RoleName.SALES,
  RoleName.INVENTORY,
  RoleName.PRODUCTION,
  RoleName.FINANCE_ACCOUNTING,
]);

const MESSAGES_PER_THREAD = 200;

@Injectable()
export class MessagingService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly bus: MessagingBus,
    private readonly usersService: UsersService,
    private readonly audit: AuditService,
    private readonly whatsapp: WhatsAppAdapter,
  ) {}

  /** ---------------- opening threads ---------------- */

  async createOwnConversation(user: AuthenticatedUser, dto: CreateConversationDto) {
    const conversation = await this.createConversation({
      customerId: user.id,
      channel: dto.channel ?? ConversationChannel.IN_PLATFORM,
      subject: dto.subject?.trim() || null,
      relatedOrderId: dto.relatedOrderId ?? null,
    });
    await this.appendMessage(conversation, MessageDirection.IN, dto.body, null, null);
    return conversation;
  }

  async createGuestConversation(dto: CreateGuestConversationDto) {
    const guestToken = randomBytes(32).toString('hex');
    const conversation = await this.createConversation({
      customerId: null,
      guestTokenHash: hashToken(guestToken),
      guestName: dto.name.trim(),
      guestEmail: dto.email?.trim() || null,
      guestPhone: dto.phone?.trim() || null,
      channel: ConversationChannel.IN_PLATFORM,
    });
    await this.appendMessage(conversation, MessageDirection.IN, dto.body, null, null);
    return { conversation, guestToken };
  }

  private async createConversation(seed: Partial<Conversation>): Promise<Conversation> {
    return this.conversationRepo.save(
      this.conversationRepo.create({
        ...seed,
        status: ConversationStatus.OPEN,
        unreadStaff: 0,
        unreadCustomer: 0,
      }),
    );
  }

  /** ---------------- reads ---------------- */

  async listForStaff(query: ConversationsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 100);
    if (query.unreadOnly) {
      const qb = this.conversationRepo
        .createQueryBuilder('conversation')
        .where('conversation.unread_staff > 0')
        .andWhere('conversation.status != :status', { status: ConversationStatus.CLOSED })
        .orderBy('conversation.last_message_at', 'DESC', 'NULLS LAST')
        .skip((page - 1) * limit)
        .take(limit);
      const [data, total] = await qb.getManyAndCount();
      return { data, total };
    }

    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.assigneeId) where.assigneeId = query.assigneeId;
    const [data, total] = await this.conversationRepo.findAndCount({
      where,
      order: { lastMessageAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    await this.withCustomerNames(data);
    return { data, total };
  }

  async listMine(user: AuthenticatedUser) {
    return this.conversationRepo.find({
      where: { customerId: user.id },
      order: { lastMessageAt: 'DESC' },
    });
  }

  /**
   * Fills `customerName` from the users table so staff surfaces can show a
   * name instead of a raw customer id. Best effort: a missing user row (deleted
   * account) simply leaves the name empty.
   */
  private async withCustomerNames(conversations: Conversation[]): Promise<void> {
    const ids = [
      ...new Set(
        conversations
          .map((c) => c.customerId)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ];
    if (ids.length === 0) return;
    const users = await this.userRepo.find({
      where: { id: In(ids) },
      select: { id: true, name: true },
    });
    const names = new Map(users.map((u) => [u.id, u.name]));
    for (const c of conversations) {
      c.customerName = c.customerId ? (names.get(c.customerId) ?? null) : null;
    }
  }

  /**
   * Thread with its messages. Staff, the owning customer and the guest token
   * holder may read; everyone else learns nothing (404, never 403).
   */
  async getDetail(
    conversationId: string,
    user?: AuthenticatedUser,
    rawGuestToken?: string,
  ) {
    const conversation = await this.authorizedConversation(conversationId, user, rawGuestToken);
    if (user && STAFF_ROLES.has(user.role)) {
      await this.withCustomerNames([conversation]);
    }
    const messages = await this.messageRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
      take: MESSAGES_PER_THREAD,
    });
    return { conversation, messages };
  }

  /** Badge count for the admin inbox. */
  async unreadForStaff(): Promise<number> {
    const { sum } = await this.conversationRepo
      .createQueryBuilder('conversation')
      .select('COALESCE(SUM(conversation.unread_staff), 0)', 'sum')
      .where('conversation.status != :status', { status: ConversationStatus.CLOSED })
      .getRawOne();
    return Number(sum ?? 0);
  }

  /** ---------------- writing ---------------- */

  async sendStaffMessage(
    conversationId: string,
    dto: SendMessageDto,
    user: AuthenticatedUser,
  ) {
    const conversation = await this.conversationRepo.findOne({ where: { id: conversationId } });
    if (!conversation) throw notFound(conversationId);
    const author = await this.usersService.findById(user.id);
    const providerRef = await this.deliverViaWhatsapp(conversation, dto.body);
    const message = await this.appendMessage(
      conversation,
      MessageDirection.OUT,
      dto.body,
      user.id,
      author.name ?? null,
      dto.attachmentUrl ?? null,
      providerRef,
    );
    // A staff reply reopens a closed thread and moves it back to the shared queue.
    await this.conversationRepo.update(conversationId, {
      status: conversation.status === ConversationStatus.CLOSED
        ? ConversationStatus.OPEN
        : conversation.status,
    });
    return message;
  }

  async sendCustomerMessage(
    conversationId: string,
    dto: SendMessageDto,
    user?: AuthenticatedUser,
    rawGuestToken?: string,
  ) {
    const conversation = await this.authorizedConversation(conversationId, user, rawGuestToken);
    if (conversation.status === ConversationStatus.CLOSED) {
      throw new BadRequestException('This conversation is closed. Start a new conversation.');
    }
    return this.appendMessage(conversation, MessageDirection.IN, dto.body, null, null, dto.attachmentUrl ?? null);
  }

  private async appendMessage(
    conversation: Conversation,
    direction: MessageDirection,
    body: string,
    authorUserId: string | null,
    authorName: string | null,
    attachmentUrl: string | null = null,
    providerRef: string | null = null,
  ): Promise<Message> {
    const preview = body.length > 140 ? `${body.slice(0, 137)}...` : body;
    const now = new Date();

    const saved = await this.dataSource.transaction(async (manager) => {
      const message = await manager.save(Message, {
        conversationId: conversation.id,
        direction,
        authorUserId,
        authorName,
        body,
        attachmentUrl,
        providerRef,
      });
      const bump: Partial<Conversation> = {
        lastMessageAt: now,
        lastMessagePreview: preview,
      };
      if (direction === MessageDirection.IN) {
        bump.unreadStaff = conversation.unreadStaff + 1;
      } else {
        bump.unreadCustomer = conversation.unreadCustomer + 1;
      }
      await manager.update(Conversation, conversation.id, bump);
      // Keep the caller's copy in step with the row it just wrote.
      Object.assign(conversation, bump);
      return message;
    });

    this.bus.emit(conversation.id);
    return saved;
  }

  /** ---------------- WhatsApp channel ---------------- */

  /**
   * Best-effort Cloud API delivery for threads whose channel is WhatsApp.
   * Unconfigured provider or a Graph error still leaves the message recorded
   * in-thread (providerRef null) - recorded, never silently dropped.
   */
  private async deliverViaWhatsapp(
    conversation: Conversation,
    body: string,
  ): Promise<string | null> {
    if (conversation.channel !== ConversationChannel.WHATSAPP) return null;
    if (!this.whatsapp.configured) return null;
    const phone = await this.recipientPhone(conversation);
    if (!phone) return null;
    try {
      const { providerRef } = await this.whatsapp.sendText(phone, body);
      return providerRef;
    } catch (error) {
      new Logger(MessagingService.name).warn(
        `WhatsApp delivery failed for conversation ${conversation.id}: ${String(error)}`,
      );
      return null;
    }
  }

  /** The phone a WhatsApp reply should reach: guest first, then the account's phone. */
  private async recipientPhone(conversation: Conversation): Promise<string | null> {
    if (conversation.guestPhone) return conversation.guestPhone;
    if (!conversation.customerId) return null;
    const user = await this.userRepo.findOne({
      where: { id: conversation.customerId },
      select: { id: true, phone: true },
    });
    return user?.phone ?? null;
  }

  /**
   * Inbound WhatsApp webhook message. Routes to the thread already open for
   * that phone (guest thread by guestPhone, else an account by phone); with
   * no thread at all it opens one as a guest. A closed thread reopens - the
   * customer reached out first, so the queue picks it back up.
   */
  async receiveWhatsappMessage(
    fromPhone: string,
    body: string,
    providerRef: string | null,
    profileName: string | null,
  ): Promise<Conversation> {
    let conversation = await this.conversationRepo.findOne({
      where: { channel: ConversationChannel.WHATSAPP, guestPhone: fromPhone },
    });
    if (!conversation) {
      const account = await this.userRepo.findOne({
        where: { phone: fromPhone },
        select: { id: true, name: true },
      });
      if (account) {
        conversation = await this.conversationRepo.findOne({
          where: { channel: ConversationChannel.WHATSAPP, customerId: account.id },
        });
        if (conversation) profileName ??= account.name;
      }
    }
    if (!conversation) {
      conversation = await this.createConversation({
        customerId: null,
        guestTokenHash: null,
        guestName: profileName ?? fromPhone,
        guestPhone: fromPhone,
        channel: ConversationChannel.WHATSAPP,
      });
    } else if (conversation.status === ConversationStatus.CLOSED) {
      await this.conversationRepo.update(conversation.id, { status: ConversationStatus.OPEN });
      conversation.status = ConversationStatus.OPEN;
    }
    await this.appendMessage(
      conversation,
      MessageDirection.IN,
      body,
      null,
      profileName ?? conversation.guestName ?? conversation.customerName ?? null,
      null,
      providerRef,
    );
    return conversation;
  }

  /** ---------------- read receipts ---------------- */

  async markReadByStaff(conversationId: string): Promise<void> {
    const conversation = await this.conversationRepo.findOne({ where: { id: conversationId } });
    if (!conversation) throw notFound(conversationId);
    await this.markRead(conversation, MessageDirection.IN, 'unreadStaff');
  }

  async markReadByCustomer(
    conversationId: string,
    user?: AuthenticatedUser,
    rawGuestToken?: string,
  ): Promise<void> {
    const conversation = await this.authorizedConversation(conversationId, user, rawGuestToken);
    await this.markRead(conversation, MessageDirection.OUT, 'unreadCustomer');
  }

  private async markRead(
    conversation: Conversation,
    direction: MessageDirection,
    counter: 'unreadStaff' | 'unreadCustomer',
  ): Promise<void> {
    if (conversation[counter] === 0) return;
    await this.dataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .update(Message)
        .set({ readAt: new Date() })
        .where('conversation_id = :id', { id: conversation.id })
        .andWhere('direction = :direction', { direction })
        .andWhere('read_at IS NULL')
        .execute();
      await manager.update(Conversation, conversation.id, { [counter]: 0 });
    });
  }

  /** ---------------- staff queue management ---------------- */

  async update(
    conversationId: string,
    dto: UpdateConversationDto,
    actorId: string,
  ) {
    const conversation = await this.conversationRepo.findOne({ where: { id: conversationId } });
    if (!conversation) throw notFound(conversationId);

    const before = { status: conversation.status, assigneeId: conversation.assigneeId };
    if (dto.status !== undefined) conversation.status = dto.status;
    if (dto.assigneeId !== undefined) conversation.assigneeId = dto.assigneeId;
    const saved = await this.conversationRepo.save(conversation);

    await this.audit.record({
      actorId,
      action: `conversation.updated`,
      beforeState: before,
      afterState: { status: saved.status, assigneeId: saved.assigneeId },
    });
    this.bus.emit(conversation.id);
    return saved;
  }

  /** ---------------- authorization ---------------- */

  private async authorizedConversation(
    conversationId: string,
    user?: AuthenticatedUser,
    rawGuestToken?: string,
  ): Promise<Conversation> {
    const conversation = await this.conversationRepo.findOne({ where: { id: conversationId } });
    if (!conversation) throw notFound(conversationId);

    if (user && STAFF_ROLES.has(user.role)) return conversation;
    if (user && conversation.customerId === user.id) return conversation;
    if (rawGuestToken && conversation.guestTokenHash === hashToken(rawGuestToken)) {
      return conversation;
    }
    throw notFound(conversationId);
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function notFound(conversationId: string): NotFoundException {
  return new NotFoundException(`Conversation ${conversationId} not found`);
}
