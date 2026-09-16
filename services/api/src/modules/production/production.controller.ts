import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { CreateBatchDto } from './dto/create-batch.dto';
import { RecordCostDto } from './dto/record-cost.dto';
import { RecordQCRejectionDto } from './dto/record-qc-rejection.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { ProductionService } from './production.service';

@ApiTags('Manufacturing & Production')
@ApiBearerAuth()
@Controller('production-batches')
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  @Get()
  @RequireAccess(ModuleName.MANUFACTURING, AccessLevel.VIEW)
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('stage') stage?: string,
  ) {
    return this.productionService.findAll(parseInt(page, 10), parseInt(limit, 10), stage);
  }

  @Get(':id')
  @RequireAccess(ModuleName.MANUFACTURING, AccessLevel.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productionService.findById(id);
  }

  /** Production starts are approval-gated at the API layer (appendix 19). */
  @Post()
  @RequireAccess(ModuleName.MANUFACTURING, AccessLevel.FULL)
  create(@Body() dto: CreateBatchDto, @CurrentUser() user: AuthenticatedUser) {
    return this.productionService.create(dto, user.id);
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
}
