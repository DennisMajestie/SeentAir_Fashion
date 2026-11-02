import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ApprovalActionType, ApprovalStatus, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ApprovalsService } from './approvals.service';
import { CreateApprovalDto } from './dto/create-approval.dto';
import { DecideApprovalDto } from './dto/decide-approval.dto';

@ApiTags('Approvals & Audit')
@ApiBearerAuth()
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  /** Any authenticated staff member can request an approval. */
  @Post()
  @RequireAccess(ModuleName.APPROVALS_AUDIT, AccessLevel.VIEW)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateApprovalDto) {
    return this.approvalsService.create(user, dto.actionType, dto.payload);
  }

  @Get('pending')
  @RequireAccess(ModuleName.APPROVALS_AUDIT, AccessLevel.APPROVE)
  findPending() {
    return this.approvalsService.findPending();
  }

  /** Full approval history with filters. */
  @Get()
  @RequireAccess(ModuleName.APPROVALS_AUDIT, AccessLevel.APPROVE)
  findAll(
    @Query() pagination: PaginationQueryDto,
    @Query('status') status?: ApprovalStatus,
    @Query('actionType') actionType?: ApprovalActionType,
  ) {
    return this.approvalsService.findAll({
      status,
      actionType,
      page: pagination.page ?? 1,
      limit: pagination.limit ?? 20,
    });
  }

  @Post(':id/decide')
  @RequireAccess(ModuleName.APPROVALS_AUDIT, AccessLevel.APPROVE)
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideApprovalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.approvalsService.decide(id, dto.decision, user, dto.justification);
  }
}
