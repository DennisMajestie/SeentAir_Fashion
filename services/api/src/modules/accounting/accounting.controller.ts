import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ApprovalActionType, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { ApprovalsService } from '../approvals/approvals.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AccountingService, ReportType } from './accounting.service';
import { RecordEntryDto } from './dto/record-entry.dto';
import { AccountingLedgerQueryDto } from './dto/accounting-ledger-query.dto';
import { LedgerEntryType } from './ledger-entry.entity';

@ApiTags('Accounting')
@ApiBearerAuth()
@Controller('accounting')
export class AccountingController {
  constructor(
    private readonly accountingService: AccountingService,
    private readonly approvalsService: ApprovalsService,
  ) {}

  @Get('ledger')
  @RequireAccess(ModuleName.ACCOUNTING, AccessLevel.VIEW)
  ledger(
    @Query() query: AccountingLedgerQueryDto,
  ) {
    return this.accountingService.ledger({
      type: query.type,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      page: query.page ?? 1,
      limit: query.limit ?? 50,
    });
  }

  /** Manual entries move funds — approval-gated at the API layer (appendix 19). */
  @Post('ledger')
  @RequireAccess(ModuleName.ACCOUNTING, AccessLevel.FULL)
  async record(@Body() dto: RecordEntryDto, @CurrentUser() user: AuthenticatedUser) {
    await this.approvalsService.assertApproved(
      dto.approvalRequestId,
      ApprovalActionType.FUND_MOVEMENT,
    );
    return this.accountingService.record({
      type: dto.type,
      amount: dto.amount,
      category: dto.category,
      referenceId: dto.referenceId ?? dto.approvalRequestId,
      recordedBy: user.id,
    });
  }

  @Get('reports/:type')
  @RequireAccess(ModuleName.ACCOUNTING, AccessLevel.VIEW)
  report(@Param('type') type: ReportType, @Query('from') from?: string, @Query('to') to?: string) {
    return this.accountingService.report(
      type,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }
}
