import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ApprovalActionType, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { ApprovalsService } from '../approvals/approvals.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { RecordPurchaseDto } from './dto/record-purchase.dto';
import { RecordUsageDto } from './dto/record-usage.dto';
import { MaterialsService } from './materials.service';

@ApiTags('Raw Materials')
@ApiBearerAuth()
@Controller('materials')
export class MaterialsController {
  constructor(
    private readonly materialsService: MaterialsService,
    private readonly approvalsService: ApprovalsService,
  ) {}

  @Get()
  @RequireAccess(ModuleName.RAW_MATERIALS, AccessLevel.VIEW)
  findAll() {
    return this.materialsService.findAll();
  }

  @Get('low-stock')
  @RequireAccess(ModuleName.RAW_MATERIALS, AccessLevel.VIEW)
  lowStock() {
    return this.materialsService.lowStock();
  }

  @Get(':id')
  @RequireAccess(ModuleName.RAW_MATERIALS, AccessLevel.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.materialsService.findById(id);
  }

  @Post()
  @RequireAccess(ModuleName.RAW_MATERIALS, AccessLevel.FULL)
  create(@Body() dto: CreateMaterialDto) {
    return this.materialsService.create(dto);
  }

  /** Purchasing is approval-gated at the API layer (appendix 19). */
  @Post(':id/purchase')
  @RequireAccess(ModuleName.RAW_MATERIALS, AccessLevel.FULL)
  async recordPurchase(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordPurchaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.approvalsService.assertApproved(
      dto.approvalRequestId,
      ApprovalActionType.PURCHASING,
    );
    return this.materialsService.recordPurchase(id, dto, user.id);
  }

  @Post(':id/usage')
  @RequireAccess(ModuleName.RAW_MATERIALS, AccessLevel.FULL)
  recordUsage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordUsageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.materialsService.recordUsage(id, dto, user.id);
  }
}
