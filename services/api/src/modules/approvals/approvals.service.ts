import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApprovalActionType, ApprovalStatus } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { UsersService } from '../users/users.service';
import { ApprovalRequest } from './approval-request.entity';

@Injectable()
export class ApprovalsService {
  constructor(
    @InjectRepository(ApprovalRequest)
    private readonly approvalRepo: Repository<ApprovalRequest>,
    private readonly usersService: UsersService,
  ) {}

  async create(
    actor: AuthenticatedUser,
    actionType: ApprovalActionType,
    payload?: Record<string, unknown>,
  ): Promise<ApprovalRequest> {
    const requestedBy = await this.usersService.findById(actor.id);
    const request = this.approvalRepo.create({
      actionType,
      payload: payload ?? null,
      requestedBy,
      status: ApprovalStatus.PENDING,
    });
    return this.approvalRepo.save(request);
  }

  async findPending(): Promise<ApprovalRequest[]> {
    return this.approvalRepo.find({
      where: { status: ApprovalStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
  }

  /** Full queue history with filters (Phase 6 reporting surface). */
  async findAll(filters: {
    status?: ApprovalStatus;
    actionType?: ApprovalActionType;
    page?: number;
    limit?: number;
  }): Promise<{ data: ApprovalRequest[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;
    if (filters.actionType) where.actionType = filters.actionType;
    const [data, total] = await this.approvalRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async decide(
    id: string,
    decision: 'approved' | 'rejected',
    decider: AuthenticatedUser,
  ): Promise<ApprovalRequest> {
    const request = await this.approvalRepo.findOne({ where: { id } });
    if (!request) throw new NotFoundException(`Approval request ${id} not found`);
    if (request.status !== ApprovalStatus.PENDING) {
      throw new ForbiddenException(`Approval request ${id} is already ${request.status}`);
    }
    // Staff cannot self-approve their own requests.
    if (request.requestedBy.id === decider.id) {
      throw new ForbiddenException('Requesters cannot decide their own approval requests');
    }
    request.status =
      decision === 'approved' ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED;
    request.approvedBy = await this.usersService.findById(decider.id);
    request.decidedAt = new Date();
    return this.approvalRepo.save(request);
  }

  /**
   * Gate for later phases: purchasing, production starts, price changes and
   * fund movements call this before executing. Throws unless an APPROVED
   * request of the right type exists — unauthorized actions are impossible
   * at the API layer, not just hidden in the UI.
   */
  async assertApproved(approvalRequestId: string, actionType: ApprovalActionType): Promise<void> {
    const request = await this.approvalRepo.findOne({ where: { id: approvalRequestId } });
    if (!request || request.actionType !== actionType) {
      throw new ForbiddenException(`No approval request of type '${actionType}' found`);
    }
    if (request.status !== ApprovalStatus.APPROVED) {
      throw new ForbiddenException(
        `Action '${actionType}' requires an approved request (current status: ${request.status})`,
      );
    }
  }
}
