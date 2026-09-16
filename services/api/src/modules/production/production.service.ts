import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ApprovalActionType } from '../../common/enums';
import { ApprovalsService } from '../approvals/approvals.service';
import { CatalogueService } from '../catalogue/catalogue.service';
import { InventoryItemType, MovementType } from '../inventory/inventory-movement.entity';
import { InventoryService } from '../inventory/inventory.service';
import { CreateBatchDto } from './dto/create-batch.dto';
import { RecordCostDto } from './dto/record-cost.dto';
import { RecordQCRejectionDto } from './dto/record-qc-rejection.dto';
import { ProductionBatch } from './entities/production-batch.entity';
import { ProductionCost } from './entities/production-cost.entity';
import { QCDisposition, QCRejection } from './entities/qc-rejection.entity';

@Injectable()
export class ProductionService {
  constructor(
    @InjectRepository(ProductionBatch) private readonly batchRepo: Repository<ProductionBatch>,
    @InjectRepository(ProductionCost) private readonly costRepo: Repository<ProductionCost>,
    @InjectRepository(QCRejection) private readonly rejectionRepo: Repository<QCRejection>,
    private readonly approvalsService: ApprovalsService,
    private readonly inventoryService: InventoryService,
    private readonly catalogueService: CatalogueService,
    private readonly config: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  get stages(): string[] {
    return this.config.get<string[]>('production.stages') ?? [];
  }

  private get completionStage(): string {
    return this.stages[this.stages.length - 1];
  }

  async findAll(
    page = 1,
    limit = 20,
    stage?: string,
  ): Promise<{ data: ProductionBatch[]; total: number; stages: string[] }> {
    const [data, total] = await this.batchRepo.findAndCount({
      where: stage ? { stage } : {},
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, stages: this.stages };
  }

  async findById(id: string): Promise<ProductionBatch> {
    const batch = await this.batchRepo.findOne({ where: { id } });
    if (!batch) throw new NotFoundException(`Production batch ${id} not found`);
    return batch;
  }

  /** Starting production is approval-gated at the API layer (appendix 19). */
  async create(dto: CreateBatchDto, actorId: string): Promise<ProductionBatch> {
    await this.approvalsService.assertApproved(
      dto.approvalRequestId,
      ApprovalActionType.PRODUCTION_START,
    );
    const variant = await this.catalogueService.findVariantById(dto.variantId);
    const batch = this.batchRepo.create({
      variant,
      quantity: dto.quantity,
      stage: this.stages[0],
      plannedDate: dto.plannedDate ?? null,
      approvalRequestId: dto.approvalRequestId,
      createdBy: actorId,
    });
    return this.batchRepo.save(batch);
  }

  /**
   * Stage moves are free between configured stages (QC can send work back),
   * but the completion stage is terminal and stocks finished goods exactly
   * once: quantity minus burned rejects, via a ledger movement (E2E-critical
   * production → inventory flow).
   */
  async updateStage(id: string, stage: string, actorId: string): Promise<ProductionBatch> {
    if (!this.stages.includes(stage)) {
      throw new BadRequestException(
        `Unknown stage '${stage}'. Configured stages: ${this.stages.join(', ')}`,
      );
    }
    const batch = await this.findById(id);
    if (batch.completedDate) {
      throw new ConflictException(`Batch ${id} is already completed; stage is final`);
    }

    if (stage === this.completionStage) {
      return this.complete(batch, actorId);
    }
    batch.stage = stage;
    return this.batchRepo.save(batch);
  }

  private async complete(batch: ProductionBatch, actorId: string): Promise<ProductionBatch> {
    const burned = await this.burnedQuantity(batch.id);
    const goodUnits = batch.quantity - burned;
    return this.dataSource.transaction(async (manager) => {
      batch.stage = this.completionStage;
      batch.completedDate = new Date();
      const saved = await manager.getRepository(ProductionBatch).save(batch);
      if (goodUnits > 0) {
        await this.inventoryService.record(
          {
            itemType: InventoryItemType.VARIANT,
            itemId: batch.variant.id,
            movementType: MovementType.PRODUCTION,
            quantityDelta: goodUnits,
            actorId,
            referenceId: batch.id,
          },
          manager,
        );
      }
      return saved;
    });
  }

  /** Upsert the four confirmed cost components for a batch. */
  async recordCost(batchId: string, dto: RecordCostDto): Promise<ProductionCost & { totalCost: number }> {
    const batch = await this.findById(batchId);
    let cost = await this.costRepo.findOne({ where: { batch: { id: batchId } } });
    if (!cost) {
      cost = this.costRepo.create({
        batch,
        materialCost: 0,
        sewingCost: 0,
        brandingCost: 0,
        packagingCost: 0,
      });
    }
    if (dto.materialCost !== undefined) cost.materialCost = dto.materialCost;
    if (dto.sewingCost !== undefined) cost.sewingCost = dto.sewingCost;
    if (dto.brandingCost !== undefined) cost.brandingCost = dto.brandingCost;
    if (dto.packagingCost !== undefined) cost.packagingCost = dto.packagingCost;
    const saved = await this.costRepo.save(cost);
    return {
      ...saved,
      totalCost: saved.materialCost + saved.sewingCost + saved.brandingCost + saved.packagingCost,
    };
  }

  async getCost(batchId: string): Promise<(ProductionCost & { totalCost: number }) | null> {
    const cost = await this.costRepo.findOne({ where: { batch: { id: batchId } } });
    if (!cost) return null;
    return {
      ...cost,
      totalCost: cost.materialCost + cost.sewingCost + cost.brandingCost + cost.packagingCost,
    };
  }

  /**
   * QC rejections are recorded before completion. Burned units never enter
   * stock (excluded from the completion movement); repaired units still
   * count into completion. Total rejections cannot exceed the batch size.
   */
  async recordQCRejection(
    batchId: string,
    dto: RecordQCRejectionDto,
    actorId: string,
  ): Promise<QCRejection> {
    const batch = await this.findById(batchId);
    if (batch.completedDate) {
      throw new ConflictException(
        `Batch ${batchId} is completed; QC rejections must be recorded before completion`,
      );
    }
    const quantity = dto.quantity ?? 1;
    const alreadyRejected = await this.totalRejectedQuantity(batchId);
    if (alreadyRejected + quantity > batch.quantity) {
      throw new BadRequestException(
        `Rejections (${alreadyRejected} + ${quantity}) would exceed batch quantity (${batch.quantity})`,
      );
    }
    const rejection = this.rejectionRepo.create({
      batch,
      quantity,
      reason: dto.reason,
      disposition: dto.disposition,
      recordedBy: actorId,
    });
    return this.rejectionRepo.save(rejection);
  }

  async findRejections(batchId: string): Promise<QCRejection[]> {
    await this.findById(batchId);
    return this.rejectionRepo.find({
      where: { batch: { id: batchId } },
      order: { createdAt: 'ASC' },
    });
  }

  private async burnedQuantity(batchId: string): Promise<number> {
    const result: { sum: string | null } | undefined = await this.rejectionRepo
      .createQueryBuilder('r')
      .select('SUM(r.quantity)', 'sum')
      .where('r.batch_id = :batchId AND r.disposition = :disposition', {
        batchId,
        disposition: QCDisposition.BURNED,
      })
      .getRawOne();
    return parseInt(result?.sum ?? '0', 10) || 0;
  }

  private async totalRejectedQuantity(batchId: string): Promise<number> {
    const result: { sum: string | null } | undefined = await this.rejectionRepo
      .createQueryBuilder('r')
      .select('SUM(r.quantity)', 'sum')
      .where('r.batch_id = :batchId', { batchId })
      .getRawOne();
    return parseInt(result?.sum ?? '0', 10) || 0;
  }
}
