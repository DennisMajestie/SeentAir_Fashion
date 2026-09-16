import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ACCESS_RANK, AccessLevel, ModuleName, RoleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { AccountingService } from '../accounting/accounting.service';
import { LedgerEntryType } from '../accounting/ledger-entry.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { PermissionsService } from '../users/permissions.service';
import { UsersService } from '../users/users.service';
import { CreateCustomOrderDto } from './dto/create-custom-order.dto';
import { IssueQuotationDto } from './dto/issue-quotation.dto';
import { RecordCustomPaymentDto } from './dto/record-custom-payment.dto';
import {
  CustomOrderRequest,
  CustomOrderStatus,
} from './entities/custom-order-request.entity';
import { Quotation } from './entities/quotation.entity';
import { SampleApproval } from './entities/sample-approval.entity';

/** Staff-driven transitions and the state each one requires. */
const STAFF_TRANSITIONS: Partial<Record<CustomOrderStatus, CustomOrderStatus>> = {
  [CustomOrderStatus.UNDER_REVIEW]: CustomOrderStatus.SUBMITTED,
  [CustomOrderStatus.SAMPLE_IN_PRODUCTION]: CustomOrderStatus.PAID,
  [CustomOrderStatus.IN_PRODUCTION]: CustomOrderStatus.SAMPLE_APPROVED,
  [CustomOrderStatus.FULFILLED]: CustomOrderStatus.IN_PRODUCTION,
  [CustomOrderStatus.DELIVERED]: CustomOrderStatus.FULFILLED,
};

@Injectable()
export class CustomOrdersService {
  constructor(
    @InjectRepository(CustomOrderRequest)
    private readonly requestRepo: Repository<CustomOrderRequest>,
    @InjectRepository(Quotation) private readonly quotationRepo: Repository<Quotation>,
    @InjectRepository(SampleApproval)
    private readonly sampleRepo: Repository<SampleApproval>,
    private readonly permissionsService: PermissionsService,
    private readonly usersService: UsersService,
    private readonly accountingService: AccountingService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(dto: CreateCustomOrderDto, user: AuthenticatedUser): Promise<CustomOrderRequest> {
    return this.requestRepo.save(
      this.requestRepo.create({
        buyer: await this.usersService.findById(user.id),
        sizes: dto.sizes,
        colours: dto.colours,
        quantity: dto.quantity,
        location: dto.location,
        fabricQuality: dto.fabricQuality,
        description: dto.description,
        desiredDate: dto.desiredDate,
        status: CustomOrderStatus.SUBMITTED,
      }),
    );
  }

  async findAll(
    user: AuthenticatedUser,
    page = 1,
    limit = 20,
  ): Promise<{ data: CustomOrderRequest[]; total: number }> {
    const access = await this.permissionsService.getAccessLevel(
      user.role,
      ModuleName.CUSTOM_ORDERS,
    );
    if (ACCESS_RANK[access] < ACCESS_RANK[AccessLevel.OWN]) {
      throw new ForbiddenException('No custom-order access');
    }
    const where = access === AccessLevel.OWN ? { buyer: { id: user.id } } : {};
    const [data, total] = await this.requestRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async findById(id: string, user: AuthenticatedUser): Promise<CustomOrderRequest> {
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) throw new NotFoundException(`Custom order ${id} not found`);
    const access = await this.permissionsService.getAccessLevel(
      user.role,
      ModuleName.CUSTOM_ORDERS,
    );
    if (ACCESS_RANK[access] < ACCESS_RANK[AccessLevel.OWN]) {
      throw new ForbiddenException('No custom-order access');
    }
    if (access === AccessLevel.OWN && request.buyer.id !== user.id) {
      throw new ForbiddenException('Not your custom order');
    }
    return request;
  }

  /**
   * Quotation is manual, and design approval authority is the MANAGER
   * (appendix 07), with the Business Owner as the standing top authority.
   * Sales hold FULL custom-order access for day-to-day handling but cannot
   * approve quotations — regular staff never self-approve (appendix 19;
   * exact approval chains remain an open item in 05-Role-Permission-Matrix).
   */
  async issueQuotation(
    id: string,
    dto: IssueQuotationDto,
    approver: AuthenticatedUser,
  ): Promise<Quotation> {
    const approvingRoles: string[] = [RoleName.MANAGEMENT, RoleName.BUSINESS_OWNER_ADMIN];
    if (!approvingRoles.includes(approver.role)) {
      throw new ForbiddenException(
        'Quotations require design-approval authority (Management or Business Owner)',
      );
    }
    const request = await this.getOrThrow(id);
    if (
      request.status !== CustomOrderStatus.SUBMITTED &&
      request.status !== CustomOrderStatus.UNDER_REVIEW
    ) {
      throw new ConflictException(`Cannot quote a request in status '${request.status}'`);
    }
    const existing = await this.quotationRepo.findOne({ where: { request: { id } } });
    if (existing) throw new ConflictException('A quotation already exists for this request');

    const quotation = await this.quotationRepo.save(
      this.quotationRepo.create({
        request,
        amount: dto.amount,
        note: dto.note ?? null,
        approvedBy: approver.id,
      }),
    );
    request.status = CustomOrderStatus.QUOTED;
    await this.requestRepo.save(request);
    void this.notificationsService.notifyInPlatform({
      recipientId: request.buyer.id,
      type: 'custom_order',
      message: `Your custom design request has been quoted: ${dto.amount}`,
    });
    return quotation;
  }

  async getQuotation(id: string): Promise<Quotation | null> {
    return this.quotationRepo.findOne({ where: { request: { id } } });
  }

  /** Buyer accepts the quotation. */
  async acceptQuote(id: string, user: AuthenticatedUser): Promise<CustomOrderRequest> {
    const request = await this.getOrThrow(id);
    if (request.buyer.id !== user.id) {
      throw new ForbiddenException('Only the requesting buyer can accept the quotation');
    }
    if (request.status !== CustomOrderStatus.QUOTED) {
      throw new ConflictException(`Cannot accept a quote in status '${request.status}'`);
    }
    request.status = CustomOrderStatus.QUOTE_ACCEPTED;
    return this.requestRepo.save(request);
  }

  /** Full payment of the quoted amount before sample production begins. */
  async recordPayment(
    id: string,
    dto: RecordCustomPaymentDto,
    actor: AuthenticatedUser,
  ): Promise<CustomOrderRequest> {
    const paymentsAccess = await this.permissionsService.getAccessLevel(
      actor.role,
      ModuleName.PAYMENTS,
    );
    if (ACCESS_RANK[paymentsAccess] < ACCESS_RANK[AccessLevel.FULL]) {
      throw new ForbiddenException('Recording custom-order payments requires full payments access');
    }
    const request = await this.getOrThrow(id);
    if (request.status !== CustomOrderStatus.QUOTE_ACCEPTED) {
      throw new ConflictException(
        `Payment is only possible after quote acceptance (status: '${request.status}')`,
      );
    }
    const quotation = await this.getQuotation(id);
    if (!quotation) throw new ConflictException('No quotation on record');
    if (Math.round(dto.amount * 100) !== Math.round(quotation.amount * 100)) {
      throw new BadRequestException(
        `Full payment required: amount must equal the quotation (${quotation.amount})`,
      );
    }
    request.status = CustomOrderStatus.PAID;
    request.paidAt = new Date();
    const saved = await this.requestRepo.save(request);
    await this.accountingService.record({
      type: LedgerEntryType.SALE,
      amount: dto.amount,
      category: 'custom_order_sale',
      referenceId: request.id,
      recordedBy: actor.id,
    });
    return saved;
  }

  /** THE GATE: the buyer approves (or rejects) the sample. */
  async decideSample(
    id: string,
    approved: boolean,
    note: string | undefined,
    user: AuthenticatedUser,
  ): Promise<SampleApproval> {
    const request = await this.getOrThrow(id);
    if (request.buyer.id !== user.id) {
      throw new ForbiddenException('Only the requesting buyer can decide on the sample');
    }
    if (request.status !== CustomOrderStatus.SAMPLE_IN_PRODUCTION) {
      throw new ConflictException(
        `Sample decision is only possible while the sample is in production (status: '${request.status}')`,
      );
    }
    const existing = await this.sampleRepo.findOne({ where: { request: { id } } });
    if (existing) throw new ConflictException('The sample has already been decided');

    const sample = await this.sampleRepo.save(
      this.sampleRepo.create({ request, buyerApproved: approved, note: note ?? null }),
    );
    request.status = approved
      ? CustomOrderStatus.SAMPLE_APPROVED
      : CustomOrderStatus.CANCELLED;
    await this.requestRepo.save(request);
    return sample;
  }

  /**
   * Staff transitions. Full production is IMPOSSIBLE without an approved
   * sample — enforced both by the transition table (IN_PRODUCTION requires
   * SAMPLE_APPROVED status) and a direct sample-record check.
   */
  async updateStatus(
    id: string,
    status: CustomOrderStatus,
    note: string | undefined,
  ): Promise<CustomOrderRequest> {
    const request = await this.getOrThrow(id);
    if (status === CustomOrderStatus.REJECTED) {
      if (request.paidAt) {
        throw new ConflictException('A paid request cannot be rejected; resolve with the buyer');
      }
      request.status = status;
      request.reviewNote = note ?? request.reviewNote;
      return this.requestRepo.save(request);
    }

    const requiredCurrent = STAFF_TRANSITIONS[status];
    if (!requiredCurrent) {
      throw new BadRequestException(`Status '${status}' is not a staff-settable transition`);
    }
    if (request.status !== requiredCurrent) {
      throw new ConflictException(
        `Cannot move to '${status}' from '${request.status}' (requires '${requiredCurrent}')`,
      );
    }
    if (status === CustomOrderStatus.IN_PRODUCTION) {
      const sample = await this.sampleRepo.findOne({ where: { request: { id } } });
      if (!sample?.buyerApproved) {
        throw new ForbiddenException(
          'Full production must not begin until the buyer has approved the sample',
        );
      }
    }
    request.status = status;
    if (note) request.reviewNote = note;
    const saved = await this.requestRepo.save(request);
    void this.notificationsService.notifyInPlatform({
      recipientId: request.buyer.id,
      type: 'custom_order',
      message: `Your custom order is now: ${status.replace(/_/g, ' ')}`,
    });
    return saved;
  }

  private async getOrThrow(id: string): Promise<CustomOrderRequest> {
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) throw new NotFoundException(`Custom order ${id} not found`);
    return request;
  }
}
