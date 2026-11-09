import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@ApiTags('Approvals & Audit')
@ApiBearerAuth()
@Controller('audit-log')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /** Full filterable UI lands in Phase 6; the query surface exists from Phase 0. */
  @Get()
  @RequireAccess(ModuleName.APPROVALS_AUDIT, AccessLevel.APPROVE)
  query(
    @Query() query: AuditQueryDto,
  ) {
    return this.auditService.query({
      actorId: query.actorId,
      action: query.action,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      page: query.page ?? 1,
      limit: query.limit ?? 50,
    });
  }

  /** Tamper-evidence badge: recomputes the full hash chain in the database. */
  @Get('verify')
  @RequireAccess(ModuleName.APPROVALS_AUDIT, AccessLevel.VIEW)
  verify() {
    return this.auditService.verify();
  }
}
