import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import {
  ConversationsQueryDto,
  CreateConversationDto,
  CreateGuestConversationDto,
} from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { Conversation, ConversationStatus } from './conversation.entity';
import { Message, MessageDirection } from './message.entity';
import { MessagingBus } from './messaging-bus';
import { MessagingService } from './messaging.service';
import { RoleName } from '../../common/enums';

describe('MessagingService', () => {
  const conversationRepo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    update: jest.fn(async () => undefined),
    findOne: jest.fn(),
    findAndCount: jest.fn(async () => [[], 0]),
    find: jest.fn(async () => []),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(async () => [[], 0]),
      getRawOne: jest.fn(async () => ({ sum: '3' })),
    })),
  };
  const messageRepo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    find: jest.fn(async () => []),
  };
  // Hoisted so every createQueryBuilder() call shares one mock chain — a fresh
  // object per call would leave the transaction's calls invisible to assertions.
  const updateQb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn(async () => undefined),
  };
  const transactionManager = {
    save: jest.fn(async (_entity: unknown, value: unknown) => value),
    update: jest.fn(async () => undefined),
    createQueryBuilder: jest.fn(() => updateQb),
  };
  const dataSource = {
    transaction: jest.fn(async (work: (manager: unknown) => Promise<unknown>) =>
      work(transactionManager),
    ),
  };
  const bus = new MessagingBus();
  const usersService = { findById: jest.fn(async (id: string) => ({ id, name: 'Ada Staff' })) };
  const userRepo = {
    find: jest.fn(async () => [{ id: 'customer-1', name: 'Chidi Okoro' }]),
  };
  const audit = { record: jest.fn(async () => undefined) };

  const staffUser = { id: 'staff-1', email: 'a@seentair.com', role: RoleName.SALES };
  const customerUser = { id: 'customer-1', email: 'c@x.com', role: RoleName.CUSTOMER };
  const wholesalerUser = { id: 'w-1', email: 'w@x.com', role: RoleName.WHOLESALER };

  const service = new MessagingService(
    conversationRepo as never,
    messageRepo as never,
    userRepo as never,
    dataSource as unknown as DataSource,
    bus,
    usersService as never,
    audit as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    conversationRepo.findOne.mockReset();
    conversationRepo.save.mockImplementation(async (value) => value);
    conversationRepo.create.mockImplementation((value) => value);
    updateQb.set.mockClear();
    updateQb.where.mockClear();
    updateQb.andWhere.mockClear();
  });

  const ownConversation = (overrides: Partial<Conversation> = {}): Conversation =>
    ({
      id: 'conv-1',
      customerId: 'customer-1',
      guestTokenHash: null,
      channel: 'in_platform' as never,
      status: ConversationStatus.OPEN,
      assigneeId: null,
      unreadStaff: 0,
      unreadCustomer: 0,
      ...overrides,
    }) as never;

  it('creates a signed-in customer conversation with the first message inbound', async () => {
    conversationRepo.create.mockImplementation((value) => ({
      id: 'conv-new',
      unreadStaff: 0,
      unreadCustomer: 0,
      ...value,
    }));

    const conversation = await service.createOwnConversation(customerUser, {
      body: 'Do you ship to Abuja?',
      subject: 'Shipping question',
    } as CreateConversationDto);

    expect(conversation.customerId).toBe('customer-1');
    expect(conversation.lastMessagePreview).toBe('Do you ship to Abuja?');
    expect(transactionManager.save).toHaveBeenCalledWith(
      Message,
      expect.objectContaining({ direction: MessageDirection.IN, body: 'Do you ship to Abuja?' }),
    );
    expect(transactionManager.update).toHaveBeenCalledWith(
      Conversation,
      'conv-new',
      expect.objectContaining({ unreadStaff: 1 }),
    );
  });

  it('hashes the guest token and only ever returns it plaintext once', async () => {
    conversationRepo.create.mockImplementation((value) => ({
      id: 'conv-guest',
      unreadStaff: 0,
      unreadCustomer: 0,
      ...value,
    }));

    const { conversation, guestToken } = await service.createGuestConversation({
      name: 'Ada Obi',
      body: 'How much for 20 tees?',
    } as CreateGuestConversationDto);

    expect(conversation.customerId).toBeNull();
    expect(conversation.guestTokenHash).toHaveLength(64);
    expect(conversation.guestTokenHash).not.toContain(guestToken);
    expect(guestToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it('lists threads with pagination for staff', async () => {
    await service.listForStaff({ page: 2, limit: 10 } as ConversationsQueryDto);
    expect(conversationRepo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });

  it('gives staff access to any thread detail', async () => {
    conversationRepo.findOne.mockResolvedValue(ownConversation());
    const detail = await service.getDetail('conv-1', staffUser);
    expect(detail.conversation.id).toBe('conv-1');
    expect(messageRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId: 'conv-1' } }),
    );
  });

  it('lets the owning customer read their thread', async () => {
    conversationRepo.findOne.mockResolvedValue(ownConversation());
    await expect(service.getDetail('conv-1', customerUser)).resolves.toBeTruthy();
  });

  it('hides threads from other customers and unrelated guests (404, never 403)', async () => {
    conversationRepo.findOne.mockResolvedValue(ownConversation());
    await expect(service.getDetail('conv-1', wholesalerUser)).rejects.toThrow(NotFoundException);
    await expect(
      service.getDetail('conv-1', undefined, 'wrong-token'),
    ).rejects.toThrow(NotFoundException);
  });

  it('sends staff replies as outbound messages authored by the staff user', async () => {
    conversationRepo.findOne.mockResolvedValue(ownConversation());

    await service.sendStaffMessage('conv-1', { body: 'Yes, we ship nationwide.' }, staffUser);

    expect(usersService.findById).toHaveBeenCalledWith('staff-1');
    expect(transactionManager.save).toHaveBeenCalledWith(
      Message,
      expect.objectContaining({
        direction: MessageDirection.OUT,
        authorUserId: 'staff-1',
        authorName: 'Ada Staff',
      }),
    );
    expect(transactionManager.update).toHaveBeenCalledWith(
      Conversation,
      'conv-1',
      expect.objectContaining({ unreadCustomer: 1 }),
    );
  });

  it('accepts a guest reply carrying the valid token and bumps unreadStaff', async () => {
    const token = 'a'.repeat(64);
    const conversation = ownConversation({ customerId: null, guestTokenHash: tokenHash(token) });
    conversationRepo.findOne.mockResolvedValue(conversation);

    await service.sendCustomerMessage('conv-1', { body: 'Any bulk discount?' }, undefined, token);

    expect(transactionManager.save).toHaveBeenCalledWith(
      Message,
      expect.objectContaining({ direction: MessageDirection.IN }),
    );
    expect(transactionManager.update).toHaveBeenCalledWith(
      Conversation,
      'conv-1',
      expect.objectContaining({ unreadStaff: 1 }),
    );
  });

  it('rejects customer messages on closed threads', async () => {
    conversationRepo.findOne.mockResolvedValue(ownConversation({ status: ConversationStatus.CLOSED }));

    await expect(
      service.sendCustomerMessage('conv-1', { body: 'hello' }, customerUser),
    ).rejects.toThrow(BadRequestException);
  });

  it('marks staff read: zeroes the counter and stamps inbound messages', async () => {
    conversationRepo.findOne.mockResolvedValue(ownConversation({ unreadStaff: 2 }));

    await service.markReadByStaff('conv-1');

    const updateQb = transactionManager.createQueryBuilder();
    expect(updateQb.set).toHaveBeenCalledWith(expect.objectContaining({ readAt: expect.any(Date) }));
    expect(updateQb.where).toHaveBeenCalledWith('conversation_id = :id', { id: 'conv-1' });
    expect(updateQb.andWhere).toHaveBeenCalledWith('direction = :direction', {
      direction: MessageDirection.IN,
    });
    expect(transactionManager.update).toHaveBeenCalledWith(
      Conversation,
      'conv-1',
      expect.objectContaining({ unreadStaff: 0 }),
    );
  });

  it('marks customer read for the guest token holder', async () => {
    const token = 'a'.repeat(64);
    conversationRepo.findOne.mockResolvedValue(
      ownConversation({ customerId: null, guestTokenHash: tokenHash(token), unreadCustomer: 1 }),
    );

    await service.markReadByCustomer('conv-1', undefined, token);

    const updateQb = transactionManager.createQueryBuilder();
    expect(updateQb.where).toHaveBeenCalledWith('conversation_id = :id', { id: 'conv-1' });
    expect(updateQb.andWhere).toHaveBeenCalledWith('direction = :direction', {
      direction: MessageDirection.OUT,
    });
    expect(transactionManager.update).toHaveBeenCalledWith(
      Conversation,
      'conv-1',
      expect.objectContaining({ unreadCustomer: 0 }),
    );
  });

  it('audits status and assignment changes made by staff', async () => {
    conversationRepo.findOne.mockResolvedValue(ownConversation());

    await service.update(
      'conv-1',
      { status: ConversationStatus.CLOSED, assigneeId: 'staff-2' } as UpdateConversationDto,
      'staff-1',
    );

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'staff-1',
        action: 'conversation.updated',
        beforeState: { status: ConversationStatus.OPEN, assigneeId: null },
      }),
    );
  });

  it('sums unread staff counters for the inbox badge, excluding closed threads', async () => {
    await expect(service.unreadForStaff()).resolves.toBe(3);
  });
});

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
