import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CatalogueService } from '../catalogue/catalogue.service';
import {
  CreateTechPackDto,
  UpsertTechPackDto,
} from './dto/upsert-tech-pack.dto';
import { TechPack } from './tech-pack.entity';
import { TechPackRevision } from './tech-pack-revision.entity';

@Injectable()
export class TechPacksService {
  constructor(
    @InjectRepository(TechPack) private readonly techPackRepo: Repository<TechPack>,
    @InjectRepository(TechPackRevision)
    private readonly revisionRepo: Repository<TechPackRevision>,
    private readonly catalogueService: CatalogueService,
  ) {}

  async findAll(): Promise<Array<TechPack & { revisionCount: number }>> {
    const packs = await this.techPackRepo.find({ relations: { variant: { product: true } } });
    return Promise.all(
      packs.map(async (p) => ({
        ...p,
        revisionCount: await this.revisionRepo.count({ where: { techPack: { id: p.id } } }),
      })),
    );
  }

  async findOne(id: string): Promise<TechPack> {
    const pack = await this.techPackRepo.findOne({
      where: { id },
      relations: { variant: { product: true } },
    });
    if (!pack) throw new NotFoundException(`Tech pack ${id} not found`);
    return pack;
  }

  async create(dto: CreateTechPackDto, actorId: string): Promise<TechPack> {
    const variant = await this.catalogueService.findVariantById(dto.variantId);
    const existing = await this.techPackRepo.findOne({ where: { variant: { id: variant.id } } });
    if (existing) {
      throw new ConflictException(`Variant ${variant.id} already has a tech pack`);
    }
    const pack = this.techPackRepo.create({
      variant,
      silhouette: dto.silhouette ?? null,
      targetYieldUnits: dto.targetYieldUnits ?? null,
      cuttingEfficiencyPct: dto.cuttingEfficiencyPct ?? null,
      gradedMeasurements: dto.gradedMeasurements ?? null,
      stitchProtocol: dto.stitchProtocol ?? null,
      laydownProtocol: dto.laydownProtocol ?? null,
      dxfUrl: dto.dxfUrl ?? null,
      revision: 1,
      status: 'draft',
      approvedBy: null,
      approvedAt: null,
      updatedBy: actorId,
    });
    const saved = await this.techPackRepo.save(pack);
    await this.snapshotRevision(saved, actorId);
    return saved;
  }

  async update(id: string, dto: UpsertTechPackDto, actorId: string): Promise<TechPack> {
    const pack = await this.findOne(id);
    if (pack.status === 'approved') {
      // Approved packs are editable only from a new revision to keep the
      // approved snapshot audit-trail intact.
      pack.status = 'draft';
      pack.approvedBy = null;
      pack.approvedAt = null;
    }
    if (dto.silhouette !== undefined) pack.silhouette = dto.silhouette;
    if (dto.targetYieldUnits !== undefined) pack.targetYieldUnits = dto.targetYieldUnits;
    if (dto.cuttingEfficiencyPct !== undefined) pack.cuttingEfficiencyPct = dto.cuttingEfficiencyPct;
    if (dto.gradedMeasurements !== undefined) pack.gradedMeasurements = dto.gradedMeasurements;
    if (dto.stitchProtocol !== undefined) pack.stitchProtocol = dto.stitchProtocol;
    if (dto.laydownProtocol !== undefined) pack.laydownProtocol = dto.laydownProtocol;
    if (dto.dxfUrl !== undefined) pack.dxfUrl = dto.dxfUrl;
    pack.updatedBy = actorId;
    const saved = await this.techPackRepo.save(pack);
    await this.snapshotRevision(saved, actorId);
    return saved;
  }

  /** Approve the current revision — makes it the shop-floor reference. */
  async approve(id: string, actorId: string): Promise<TechPack> {
    const pack = await this.findOne(id);
    pack.status = 'approved';
    pack.approvedBy = actorId;
    pack.approvedAt = new Date();
    return this.techPackRepo.save(pack);
  }

  async revisions(id: string): Promise<TechPackRevision[]> {
    await this.findOne(id);
    return this.revisionRepo.find({
      where: { techPack: { id } },
      order: { revision: 'DESC' },
    });
  }

  /** Immutable snapshot of the pack's current fields + revision marker. */
  private async snapshotRevision(pack: TechPack, actorId: string | null): Promise<void> {
    await this.revisionRepo.save(
      this.revisionRepo.create({
        techPack: pack,
        revision: pack.revision,
        snapshot: {
          revision: pack.revision,
          status: pack.status,
          silhouette: pack.silhouette,
          targetYieldUnits: pack.targetYieldUnits,
          cuttingEfficiencyPct: pack.cuttingEfficiencyPct,
          gradedMeasurements: pack.gradedMeasurements,
          stitchProtocol: pack.stitchProtocol,
          laydownProtocol: pack.laydownProtocol,
          dxfUrl: pack.dxfUrl,
        },
        createdBy: actorId,
      }),
    );
  }
}