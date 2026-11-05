import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ApprovalActionType } from '../../common/enums';
import { ApprovalsService } from '../approvals/approvals.service';
import { CreateStockCountDto } from './dto/create-stock-count.dto';
import { MovementType } from './inventory-movement.entity';
import { InventoryService } from './inventory.service';
import { InventoryStockCountLine } from './entities/inventory-stock-count-line.entity';
import { InventoryStockCount } from './entities/inventory-stock-count.entity';

@Injectable()
export class InventoryCountsService {
  constructor(
    @InjectRepository(InventoryStockCount)
    private readonly countRepo: Repository<InventoryStockCount>,
    private readonly inventory: InventoryService,
    private readonly approvals: ApprovalsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async list(page = 1, limit = 50): Promise<{ data: InventoryStockCount[]; total: number }> {
    const [data, total] = await this.countRepo.findAndCount({
      relations: { lines: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async record(dto: CreateStockCountDto, actorId: string): Promise<InventoryStockCount> {
    const seen = new Set<string>();
    for (const item of dto.items) {
      const key = `${item.itemType}:${item.itemId}`;
      if (seen.has(key)) {
        throw new BadRequestException(`Item ${item.itemId} appears more than once in this count`);
      }
      seen.add(key);
    }

    return this.dataSource.transaction(async (manager) => {
      await this.inventory.lockItems(manager, dto.items);
      const lines: InventoryStockCountLine[] = [];
      for (const input of dto.items) {
        const systemQuantity = await this.inventory.currentQuantity(
          input.itemType,
          input.itemId,
          manager,
        );
        const adjustmentQuantity = input.countedQuantity - systemQuantity;
        if (adjustmentQuantity < 0) {
          if (!input.approvalRequestId) {
            throw new BadRequestException(
              `A stock-disposal approval is required to decrease ${input.itemType} ${input.itemId}`,
            );
          }
          await this.approvals.assertApproved(
            input.approvalRequestId,
            ApprovalActionType.STOCK_DISPOSAL,
          );
        }
        lines.push(
          manager.getRepository(InventoryStockCountLine).create({
            itemType: input.itemType,
            itemId: input.itemId,
            systemQuantity,
            countedQuantity: input.countedQuantity,
            adjustmentQuantity,
            approvalRequestId: input.approvalRequestId ?? null,
          }),
        );
      }

      const count = await manager.getRepository(InventoryStockCount).save(
        manager.getRepository(InventoryStockCount).create({
          createdBy: actorId,
        }),
      );
      for (const line of lines) {
        line.stockCount = count;
        if (line.adjustmentQuantity !== 0) {
          await this.inventory.record(
            {
              itemType: line.itemType,
              itemId: line.itemId,
              movementType: MovementType.ADJUSTMENT,
              quantityDelta: line.adjustmentQuantity,
              actorId,
              referenceId: count.id,
            },
            manager,
          );
        }
      }
      await manager.getRepository(InventoryStockCountLine).save(
        lines.map((line) => ({ ...line, stockCount: count })),
      );
      return { ...count, lines };
    });
  }
}
