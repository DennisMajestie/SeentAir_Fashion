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
import { RecordMovementDto } from './dto/record-movement.dto';
import { InventoryItemType } from './inventory-movement.entity';
import { InventoryService } from './inventory.service';

@ApiTags('Inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly approvalsService: ApprovalsService,
  ) {}

  @Get('summary')
  @RequireAccess(ModuleName.INVENTORY, AccessLevel.VIEW)
  summary() {
    return this.inventoryService.summary();
  }

  @Get(':variantId/movements')
  @RequireAccess(ModuleName.INVENTORY, AccessLevel.VIEW)
  movements(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('itemType') itemType: InventoryItemType = InventoryItemType.VARIANT,
  ) {
    return this.inventoryService.movements(
      itemType,
      variantId,
      parseInt(page, 10),
      parseInt(limit, 10),
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
    return this.inventoryService.record({
      itemType,
      itemId: variantId,
      movementType: dto.movementType,
      quantityDelta: dto.quantityDelta,
      actorId: user.id,
      referenceId: dto.referenceId ?? dto.approvalRequestId ?? null,
    });
  }
}
