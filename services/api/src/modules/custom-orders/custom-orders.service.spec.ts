import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RoleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { AccountingService } from '../accounting/accounting.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PermissionsService } from '../users/permissions.service';
import { UsersService } from '../users/users.service';
import { CustomOrdersService } from './custom-orders.service';
import {
  CustomOrderRequest,
  CustomOrderStatus,
} from './entities/custom-order-request.entity';
import { Quotation } from './entities/quotation.entity';
import { SampleApproval } from './entities/sample-approval.entity';

const buyer: AuthenticatedUser = { id: 'buyer-1', email: 'b@x.test', role: RoleName.WHOLESALER };

describe('CustomOrdersService — flow gates', () => {
  let service: CustomOrdersService;
  let request: Record<string, unknown>;

  const requestRepo = {
    findOne: jest.fn(async () => request),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
    findAndCount: jest.fn(async () => [[], 0]),
  };
  const quotationRepo = { findOne: jest.fn(), create: jest.fn((v) => v), save: jest.fn(async (v) => v) };
  const sampleRepo = { findOne: jest.fn(), create: jest.fn((v) => v), save: jest.fn(async (v) => v) };
  const accountingService = { record: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    request = {
      id: 'co-1',
      buyer: { id: 'buyer-1' },
      status: CustomOrderStatus.SAMPLE_IN_PRODUCTION,
      paidAt: new Date(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CustomOrdersService,
        { provide: getRepositoryToken(CustomOrderRequest), useValue: requestRepo },
        { provide: getRepositoryToken(Quotation), useValue: quotationRepo },
        { provide: getRepositoryToken(SampleApproval), useValue: sampleRepo },
        { provide: PermissionsService, useValue: { getAccessLevel: jest.fn() } },
        { provide: UsersService, useValue: { findById: jest.fn(async (id: string) => ({ id })) } },
        { provide: AccountingService, useValue: accountingService },
        {
          provide: NotificationsService,
          useValue: { notifyInPlatform: jest.fn(async () => undefined) },
        },
      ],
    }).compile();
    service = moduleRef.get(CustomOrdersService);
  });

  describe('the sample-approval gate (client-added hard requirement)', () => {
    it('full production is refused without an approved sample record', async () => {
      request.status = CustomOrderStatus.SAMPLE_APPROVED; // status alone is not enough
      sampleRepo.findOne.mockResolvedValue(null);
      await expect(
        service.updateStatus('co-1', CustomOrderStatus.IN_PRODUCTION, undefined),
      ).rejects.toThrow('buyer has approved the sample');
    });

    it('full production is refused when the sample was rejected', async () => {
      request.status = CustomOrderStatus.SAMPLE_APPROVED;
      sampleRepo.findOne.mockResolvedValue({ buyerApproved: false });
      await expect(
        service.updateStatus('co-1', CustomOrderStatus.IN_PRODUCTION, undefined),
      ).rejects.toThrow(ForbiddenException);
    });

    it('production cannot be reached straight from sample_in_production', async () => {
      request.status = CustomOrderStatus.SAMPLE_IN_PRODUCTION;
      await expect(
        service.updateStatus('co-1', CustomOrderStatus.IN_PRODUCTION, undefined),
      ).rejects.toThrow(ConflictException);
    });

    it('full production proceeds with an approved sample', async () => {
      request.status = CustomOrderStatus.SAMPLE_APPROVED;
      sampleRepo.findOne.mockResolvedValue({ buyerApproved: true });
      const updated = await service.updateStatus(
        'co-1',
        CustomOrderStatus.IN_PRODUCTION,
        undefined,
      );
      expect((updated as { status: string }).status).toBe(CustomOrderStatus.IN_PRODUCTION);
    });

    it('only the buyer can decide the sample; a rejection cancels the request', async () => {
      sampleRepo.findOne.mockResolvedValue(null);
      await expect(
        service.decideSample('co-1', true, undefined, { ...buyer, id: 'someone-else' }),
      ).rejects.toThrow(ForbiddenException);
      await service.decideSample('co-1', false, 'wrong shade', buyer);
      expect(request.status).toBe(CustomOrderStatus.CANCELLED);
    });
  });

  describe('payment gate', () => {
    const finance: AuthenticatedUser = {
      id: 'fin-1',
      email: 'f@x.test',
      role: RoleName.FINANCE_ACCOUNTING,
    };

    it('payment must equal the quotation exactly (full payment before sample)', async () => {
      const moduleRefPerms = service['permissionsService'] as unknown as {
        getAccessLevel: jest.Mock;
      };
      moduleRefPerms.getAccessLevel.mockResolvedValue('full');
      request.status = CustomOrderStatus.QUOTE_ACCEPTED;
      quotationRepo.findOne.mockResolvedValue({ amount: 500000 });
      await expect(
        service.recordPayment('co-1', { method: 'cash' as never, amount: 400000 }, finance),
      ).rejects.toThrow(BadRequestException);
      await service.recordPayment('co-1', { method: 'cash' as never, amount: 500000 }, finance);
      expect(request.status).toBe(CustomOrderStatus.PAID);
      expect(accountingService.record).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'sale', amount: 500000, category: 'custom_order_sale' }),
      );
    });
  });
});
