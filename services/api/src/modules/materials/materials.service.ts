import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  InventoryItemType,
  MovementType,
} from '../inventory/inventory-movement.entity';
import { InventoryService } from '../inventory/inventory.service';
import { AccountingService } from '../accounting/accounting.service';
import { LedgerEntryType } from '../accounting/ledger-entry.entity';
import { CreateMaterialDto } from './dto/create-material.dto';
import { RecordPurchaseDto } from './dto/record-purchase.dto';
import { RecordUsageDto } from './dto/record-usage.dto';
import { MaterialPurchase } from './entities/material-purchase.entity';
import { MaterialUsage } from './entities/material-usage.entity';
import { RawMaterial } from './entities/raw-material.entity';

export interface MaterialWithQuantity extends RawMaterial {
  currentQuantity: number;
  lowStock: boolean;
}

@Injectable()
export class MaterialsService {
  constructor(
    @InjectRepository(RawMaterial) private readonly materialRepo: Repository<RawMaterial>,
    @InjectRepository(MaterialPurchase)
    private readonly purchaseRepo: Repository<MaterialPurchase>,
    @InjectRepository(MaterialUsage) private readonly usageRepo: Repository<MaterialUsage>,
    private readonly inventoryService: InventoryService,
    private readonly accountingService: AccountingService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<MaterialWithQuantity[]> {
    const materials = await this.materialRepo.find({ order: { name: 'ASC' } });
    return Promise.all(materials.map((m) => this.withQuantity(m)));
  }

  async findById(id: string): Promise<MaterialWithQuantity> {
    const material = await this.materialRepo.findOne({ where: { id } });
    if (!material) throw new NotFoundException(`Material ${id} not found`);
    return this.withQuantity(material);
  }

  async create(dto: CreateMaterialDto): Promise<MaterialWithQuantity> {
    const material = await this.materialRepo.save(
      this.materialRepo.create({
        name: dto.name,
        unit: dto.unit,
        reorderThreshold: dto.reorderThreshold ?? 0,
      }),
    );
    return this.withQuantity(material);
  }

  /**
   * Purchase = purchase record + ledger movement in ONE transaction.
   * Approval is asserted by the controller before this runs.
   */
  async recordPurchase(
    materialId: string,
    dto: RecordPurchaseDto,
    actorId: string,
  ): Promise<MaterialPurchase> {
    const material = await this.findById(materialId);
    return this.dataSource.transaction(async (manager) => {
      const purchase = await manager.getRepository(MaterialPurchase).save(
        manager.getRepository(MaterialPurchase).create({
          material,
          quantity: dto.quantity,
          cost: dto.cost,
          note: dto.note ?? null,
          recordedBy: actorId,
        }),
      );
      await this.inventoryService.record(
        {
          itemType: InventoryItemType.MATERIAL,
          itemId: materialId,
          movementType: MovementType.PURCHASE,
          quantityDelta: dto.quantity,
          actorId,
          referenceId: purchase.id,
        },
        manager,
      );
      // Material spend lands in the accounting ledger automatically.
      await this.accountingService.record(
        {
          type: LedgerEntryType.PURCHASE,
          amount: dto.cost,
          category: 'raw_materials',
          referenceId: purchase.id,
          recordedBy: actorId,
        },
        manager,
      );
      return purchase;
    });
  }

  /** Usage = usage record + negative ledger movement (production consumption). */
  async recordUsage(
    materialId: string,
    dto: RecordUsageDto,
    actorId: string,
  ): Promise<MaterialUsage> {
    const material = await this.findById(materialId);
    return this.dataSource.transaction(async (manager) => {
      const usage = await manager.getRepository(MaterialUsage).save(
        manager.getRepository(MaterialUsage).create({
          material,
          batchId: dto.batchId ?? null,
          quantityUsed: dto.quantityUsed,
          recordedBy: actorId,
        }),
      );
      await this.inventoryService.record(
        {
          itemType: InventoryItemType.MATERIAL,
          itemId: materialId,
          movementType: MovementType.PRODUCTION,
          quantityDelta: -dto.quantityUsed,
          actorId,
          referenceId: dto.batchId ?? usage.id,
        },
        manager,
      );
      return usage;
    });
  }

  async lowStock(): Promise<MaterialWithQuantity[]> {
    const all = await this.findAll();
    return all.filter((m) => m.lowStock);
  }

  private async withQuantity(material: RawMaterial): Promise<MaterialWithQuantity> {
    const currentQuantity = await this.inventoryService.currentQuantity(
      InventoryItemType.MATERIAL,
      material.id,
    );
    return {
      ...material,
      currentQuantity,
      lowStock: currentQuantity <= material.reorderThreshold,
    };
  }
}
