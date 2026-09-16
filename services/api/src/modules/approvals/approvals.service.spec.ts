import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ApprovalActionType, ApprovalStatus } from '../../common/enums';
import { UsersService } from '../users/users.service';
import { ApprovalRequest } from './approval-request.entity';
import { ApprovalsService } from './approvals.service';

describe('ApprovalsService', () => {
  let service: ApprovalsService;
  const repo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
  };
  const usersService = { findById: jest.fn(async (id: string) => ({ id })) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ApprovalsService,
        { provide: getRepositoryToken(ApprovalRequest), useValue: repo },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();
    service = moduleRef.get(ApprovalsService);
  });

  describe('assertApproved (the server-side gate)', () => {
    it('rejects when no approval request exists', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.assertApproved('missing-id', ApprovalActionType.PRICE_CHANGE),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a pending (undecided) request', async () => {
      repo.findOne.mockResolvedValue({
        id: 'r1',
        actionType: ApprovalActionType.FUND_MOVEMENT,
        status: ApprovalStatus.PENDING,
      });
      await expect(
        service.assertApproved('r1', ApprovalActionType.FUND_MOVEMENT),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a request of the wrong action type', async () => {
      repo.findOne.mockResolvedValue({
        id: 'r1',
        actionType: ApprovalActionType.PURCHASING,
        status: ApprovalStatus.APPROVED,
      });
      await expect(
        service.assertApproved('r1', ApprovalActionType.PRICE_CHANGE),
      ).rejects.toThrow(ForbiddenException);
    });

    it('passes for an approved request of the right type', async () => {
      repo.findOne.mockResolvedValue({
        id: 'r1',
        actionType: ApprovalActionType.PRODUCTION_START,
        status: ApprovalStatus.APPROVED,
      });
      await expect(
        service.assertApproved('r1', ApprovalActionType.PRODUCTION_START),
      ).resolves.toBeUndefined();
    });
  });

  describe('decide', () => {
    it('blocks self-approval', async () => {
      repo.findOne.mockResolvedValue({
        id: 'r1',
        status: ApprovalStatus.PENDING,
        requestedBy: { id: 'user-1' },
      });
      await expect(
        service.decide('r1', 'approved', { id: 'user-1', email: 'x', role: 'management' as never }),
      ).rejects.toThrow('Requesters cannot decide their own approval requests');
    });

    it('blocks re-deciding a settled request', async () => {
      repo.findOne.mockResolvedValue({
        id: 'r1',
        status: ApprovalStatus.APPROVED,
        requestedBy: { id: 'user-1' },
      });
      await expect(
        service.decide('r1', 'rejected', { id: 'user-2', email: 'x', role: 'management' as never }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
