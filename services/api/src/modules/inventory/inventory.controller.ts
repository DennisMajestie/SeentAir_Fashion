import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ApprovalActionType, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { ApprovalsService } from '../approvals/approvals.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { RecordMovementDto } from './dto/record-movement.dto';
import { CreateStockCountDto } from './dto/create-stock-count.dto';
import { MovementsQueryDto } from './dto/movements-query.dto';
import { InventoryItemType } from './inventory-movement.entity';
import { InventoryCountsService } from './inventory-counts.service';
import { InventoryService } from './inventory.service';

@ApiTags('Inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly inventoryCounts: InventoryCountsService,
    private readonly approvalsService: ApprovalsService,
  ) {}

  @Get('summary')
  @RequireAccess(ModuleName.INVENTORY, AccessLevel.VIEW)
  summary() {
    return this.inventoryService.summary();
  }

  /** Tamper-evidence badge: recomputes the whole movement chain in the database. */
  @Get('ledger/verify')
  @RequireAccess(ModuleName.INVENTORY, AccessLevel.VIEW)
  verify() {
    return this.inventoryService.verify();
  }

  @Get('counts')
  @RequireAccess(ModuleName.INVENTORY, AccessLevel.VIEW)
  counts(@Query() pagination: PaginationQueryDto) {
    return this.inventoryCounts.list(pagination.page ?? 1, pagination.limit ?? 50);
  }

  @Post('counts')
  @RequireAccess(ModuleName.INVENTORY, AccessLevel.FULL)
  recordCount(@Body() dto: CreateStockCountDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inventoryCounts.record(dto, user.id);
  }

  /** Per-item ledger digest: derived quantity + hash-chain head ("badge"). */
  @Get('digest/:itemType/:itemId')
  @RequireAccess(ModuleName.INVENTORY, AccessLevel.VIEW)
  digest(
    @Param('itemType') itemType: InventoryItemType,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.inventoryService.digest(itemType, itemId);
  }

  @Get(':variantId/movements')
  @RequireAccess(ModuleName.INVENTORY, AccessLevel.VIEW)
  movements(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Query() query: MovementsQueryDto,
  ) {
    return this.inventoryService.movements(
      query.itemType ?? InventoryItemType.VARIANT,
      variantId,
      query.page ?? 1,
      query.limit ?? 50,
    );
  }

  /**
   * Manual movement (adjustments). Stock-removing movements are approval-gated
   * server-side; system flows never come through this endpoint.
   */
  @Post(':variantId/movements')
  @RequireAccess(ModuleName.INVENTORY, AccessLevel.FULL)
  async record(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: RecordMovementDto,
    @CurrentUser() user: AuthenticatedUser,
    @Query('itemType') itemType: InventoryItemType = InventoryItemType.VARIANT,
  ) {
    if (dto.quantityDelta < 0) {
      if (!dto.approvalRequestId) {
        throw new ForbiddenException(
          'Removing stock requires an approved request (approvalRequestId)',
        );
      }
      await this.approvalsService.assertApproved(
        dto.approvalRequestId,
        ApprovalActionType.STOCK_DISPOSAL,
      );
    }
    return this.inventoryService.recordStandalone({
      itemType,
      itemId: variantId,
      movementType: dto.movementType,
      quantityDelta: dto.quantityDelta,
      actorId: user.id,
      referenceId: dto.referenceId ?? dto.approvalRequestId ?? null,
    });
  }
}
