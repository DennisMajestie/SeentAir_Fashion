import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ApprovalActionType, ModuleName, RoleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { ApprovalsService } from '../approvals/approvals.service';
import { ProductionQueryDto } from './dto/production-query.dto';
import { CreateBatchDto } from './dto/create-batch.dto';
import { RecordCostDto } from './dto/record-cost.dto';
import { RecordQCRejectionDto } from './dto/record-qc-rejection.dto';
import { RecordScanDto } from './dto/record-scan.dto';
import { RecordTelemetryDto } from './dto/record-telemetry.dto';
import { RegisterBarcodeDto } from './dto/register-barcode.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { ProductionService } from './production.service';

@ApiTags('Manufacturing & Production')
@ApiBearerAuth()
@Controller('production-batches')
export class ProductionController {
  constructor(
    private readonly productionService: ProductionService,
    private readonly approvalsService: ApprovalsService,
  ) {}

  @Get()
  @RequireAccess(ModuleName.MANUFACTURING, AccessLevel.VIEW)
  findAll(@Query() query: ProductionQueryDto) {
    return this.productionService.findAll(query.page ?? 1, query.limit ?? 20, query.stage);
  }

  /** Work-in-progress snapshot: units per stage + materials issued into runs. */
  @Get('wip')
  @RequireAccess(ModuleName.MANUFACTURING, AccessLevel.VIEW)
  wip() {
    return this.productionService.wip();
  }

  /** Planning suggestions from recent sales + open orders vs stock and WIP. */
  @Get('planning')
  @RequireAccess(ModuleName.MANUFACTURING, AccessLevel.VIEW)
  planning() {
    return this.productionService.planning();
  }

  @Get(':id')
  @RequireAccess(ModuleName.MANUFACTURING, AccessLevel.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productionService.findById(id);
  }

  /** Production starts are approval-gated at the API layer (appendix 19). */
  @Post()
  @RequireAccess(ModuleName.MANUFACTURING, AccessLevel.FULL)
  async create(@Body() dto: CreateBatchDto, @CurrentUser() user: AuthenticatedUser) {
    let approvalRequestId = dto.approvalRequestId;
    if (!approvalRequestId) {
      if (user.role !== RoleName.BUSINESS_OWNER_ADMIN) {
        throw new BadRequestException(
          'Production starts require an approved request (approvalRequestId)',
        );
      }
      // The owner is the top approval authority, so their own start is approved
      // on creation. Still record the request: the gate below stays in force and
      // the audit trail shows who authorised the run.
      const approval = await this.approvalsService.create(
        user,
        ApprovalActionType.PRODUCTION_START,
        { variantId: dto.variantId, quantity: dto.quantity },
      );
      approvalRequestId = approval.id;
    }
    return this.productionService.create({ ...dto, approvalRequestId }, user.id);
  }

  @Patch(':id/stage')
  @RequireAccess(ModuleName.MANUFACTURING, AccessLevel.FULL)
  updateStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productionService.updateStage(id, dto.stage, user.id);
  }

  /** Cancel a batch before completion — no stock movement, audit trail kept. */
  @Patch(':id/cancel')
  @RequireAccess(ModuleName.MANUFACTURING, AccessLevel.FULL)
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.productionService.cancel(id, user.id);
  }

  @Get(':id/cost')
  @RequireAccess(ModuleName.MANUFACTURING, AccessLevel.VIEW)
  getCost(@Param('id', ParseUUIDPipe) id: string) {
    return this.productionService.getCost(id);
  }

  @Post(':id/cost')
  @RequireAccess(ModuleName.MANUFACTURING, AccessLevel.FULL)
  recordCost(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordCostDto) {
    return this.productionService.recordCost(id, dto);
  }

  @Get(':id/qc-rejections')
  @RequireAccess(ModuleName.MANUFACTURING, AccessLevel.VIEW)
  findRejections(@Param('id', ParseUUIDPipe) id: string) {
    return this.productionService.findRejections(id);
  }

  @Post(':id/qc-rejection')
  @RequireAccess(ModuleName.MANUFACTURING, AccessLevel.FULL)
  recordRejection(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordQCRejectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productionService.recordQCRejection(id, dto, user.id);
  }

  // --- Floor kiosk: barcode, scans & machine telemetry ---

  @Post(':id/barcode')
  @RequireAccess(ModuleName.MANUFACTURING, AccessLevel.FULL)
  registerBarcode(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RegisterBarcodeDto) {
    return this.productionService.registerBarcode(id, dto.barcode);
  }

  @Post(':id/scans')
  @RequireAccess(ModuleName.MANUFACTURING, AccessLevel.FULL)
  recordScan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordScanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productionService.recordScan(id, dto, user.id);
  }

  @Get(':id/scans')
  @RequireAccess(ModuleName.MANUFACTURING, AccessLevel.VIEW)
  findScans(@Param('id', ParseUUIDPipe) id: string) {
    return this.productionService.findScans(id);
  }

  @Post(':id/telemetry')
  @RequireAccess(ModuleName.MANUFACTURING, AccessLevel.FULL)
  recordTelemetry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordTelemetryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productionService.recordTelemetry(id, dto, user.id);
  }

  @Get(':id/telemetry')
  @RequireAccess(ModuleName.MANUFACTURING, AccessLevel.VIEW)
  findTelemetry(@Param('id', ParseUUIDPipe) id: string) {
    return this.productionService.findTelemetry(id);
  }

  /** Planned BOM vs consumed materials for the batch (yield review). */
  @Get(':id/bom')
  @RequireAccess(ModuleName.MANUFACTURING, AccessLevel.VIEW)
  plannedVsConsumed(@Param('id', ParseUUIDPipe) id: string) {
    return this.productionService.plannedVsConsumed(id);
  }
}
