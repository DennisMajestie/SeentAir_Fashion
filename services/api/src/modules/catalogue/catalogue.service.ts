import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ApprovalActionType } from '../../common/enums';
import { ApprovalsService } from '../approvals/approvals.service';
import { TechPack } from '../tech-packs/tech-pack.entity';
import { ReplaceBomDto } from './dto/bom.dto';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { Collection } from './entities/collection.entity';
import { ProductBomItem } from './entities/product-bom-item.entity';
import { Product } from './entities/product.entity';
import { ProductVariant } from './entities/product-variant.entity';

@Injectable()
export class CatalogueService {
  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductVariant) private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(Collection) private readonly collectionRepo: Repository<Collection>,
    @InjectRepository(ProductBomItem) private readonly bomRepo: Repository<ProductBomItem>,
    @InjectRepository(TechPack) private readonly techPackRepo: Repository<TechPack>,
    private readonly approvalsService: ApprovalsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // --- Products ---

  async findAll(page = 1, limit = 20): Promise<{ data: Product[]; total: number }> {
    const [data, total] = await this.productRepo.findAndCount({
      relations: { variants: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async findById(id: string): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: { variants: true },
    });
    if (!product) throw new NotFoundException(`Product ${id} not found`);
    return product;
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const product = this.productRepo.create({
      name: dto.name,
      description: dto.description ?? null,
      category: dto.category ?? null,
      basePrice: dto.basePrice,
      collection: dto.collectionId ? await this.getCollection(dto.collectionId) : null,
    });
    const saved = await this.productRepo.save(product);
    return this.findById(saved.id);
  }

  /**
   * Price changes are approval-gated AT THE API LAYER (architectural
   * principle #3): a basePrice change without an approved PRICE_CHANGE
   * request is rejected server-side, not just hidden in the UI.
   */
  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findById(id);

    const isPriceChange = dto.basePrice !== undefined && dto.basePrice !== product.basePrice;
    if (isPriceChange) {
      if (!dto.approvalRequestId) {
        throw new ForbiddenException(
          'Price changes require an approved request (approvalRequestId)',
        );
      }
      await this.approvalsService.assertApproved(
        dto.approvalRequestId,
        ApprovalActionType.PRICE_CHANGE,
      );
      product.basePrice = dto.basePrice!;
    }

    if (dto.name !== undefined) product.name = dto.name;
    if (dto.description !== undefined) product.description = dto.description;
    if (dto.category !== undefined) product.category = dto.category;
    if (dto.collectionId !== undefined) {
      product.collection = await this.getCollection(dto.collectionId);
    }

    await this.productRepo.save(product);
    return this.findById(id);
  }

  // --- Variants ---

  async findVariantById(variantId: string): Promise<ProductVariant> {
    const variant = await this.variantRepo.findOne({
      where: { id: variantId },
      relations: { product: true, bomItems: { material: true } },
    });
    if (!variant) throw new NotFoundException(`Variant ${variantId} not found`);
    return variant;
  }

  async findVariants(productId: string): Promise<ProductVariant[]> {
    await this.findById(productId);
    return this.variantRepo.find({
      where: { product: { id: productId } },
      order: { createdAt: 'ASC' },
    });
  }

  async createVariant(productId: string, dto: CreateVariantDto): Promise<ProductVariant> {
    const product = await this.findById(productId);
    const existing = await this.variantRepo.findOne({ where: { sku: dto.sku } });
    if (existing) throw new ConflictException(`SKU ${dto.sku} already exists`);
    const variant = this.variantRepo.create({
      product,
      size: dto.size ?? null,
      colour: dto.colour ?? null,
      sku: dto.sku,
      priceOverride: dto.priceOverride ?? null,
      imageUrl: dto.imageUrl ?? null,
      availabilityStatus: dto.availabilityStatus,
      fitNote: dto.fitNote ?? null,
      patternGeometry: dto.patternGeometry ?? null,
      dxfUrl: dto.dxfUrl ?? null,
      storageLocation: dto.storageLocation ?? null,
    });
    return this.variantRepo.save(variant);
  }

  /** Update the garment-engineering fields of one variant in place. */
  async updateVariant(variantId: string, dto: UpdateVariantDto): Promise<ProductVariant> {
    const variant = await this.findVariantById(variantId);
    if (dto.size !== undefined) variant.size = dto.size;
    if (dto.colour !== undefined) variant.colour = dto.colour;
    if (dto.availabilityStatus !== undefined) variant.availabilityStatus = dto.availabilityStatus;
    if (dto.fitNote !== undefined) variant.fitNote = dto.fitNote;
    if (dto.patternGeometry !== undefined) variant.patternGeometry = dto.patternGeometry;
    if (dto.dxfUrl !== undefined) variant.dxfUrl = dto.dxfUrl;
    if (dto.storageLocation !== undefined) variant.storageLocation = dto.storageLocation;
    return this.variantRepo.save(variant);
  }

  // --- Bill of materials (per variant) ---

  async getBom(variantId: string): Promise<ProductBomItem[]> {
    await this.findVariantById(variantId);
    return this.bomRepo.find({
      where: { variant: { id: variantId } },
      order: { createdAt: 'ASC' },
    });
  }

  /** Replace the whole planned BOM for a variant in one transaction. */
  async replaceBom(variantId: string, dto: ReplaceBomDto): Promise<ProductBomItem[]> {
    const variant = await this.findVariantById(variantId);
    return this.dataSource.transaction(async (manager) => {
      await manager.getRepository(ProductBomItem).delete({ variant: { id: variantId } });
      const rows = dto.items.map((i) =>
        manager.getRepository(ProductBomItem).create({
          variant,
          material: { id: i.materialId } as never,
          quantity: i.quantity,
          note: i.note ?? null,
        }),
      );
      await manager.getRepository(ProductBomItem).save(rows);
      return manager.getRepository(ProductBomItem).find({
        where: { variant: { id: variantId } },
        order: { createdAt: 'ASC' },
      });
    });
  }

  /**
   * Full engineering spec-sheet for a SKU: fit note, pattern geometry, DXF
   * source, planned BOM and the current approved tech pack (if any).
   */
  async specSheet(variantId: string): Promise<{
    variant: ProductVariant;
    bom: ProductBomItem[];
    techPack: TechPack | null;
  }> {
    const variant = await this.findVariantById(variantId);
    const [bom, techPack] = await Promise.all([
      this.getBom(variantId),
      this.techPackRepo.findOne({
        where: { variant: { id: variantId }, status: 'approved' },
        order: { revision: 'DESC' },
      }),
    ]);
    return { variant, bom, techPack };
  }

  // --- Collections ---

  async findCollections(): Promise<Collection[]> {
    return this.collectionRepo.find({ order: { name: 'ASC' } });
  }

  async createCollection(dto: CreateCollectionDto): Promise<Collection> {
    const existing = await this.collectionRepo.findOne({ where: { name: dto.name } });
    if (existing) throw new ConflictException(`Collection '${dto.name}' already exists`);
    return this.collectionRepo.save(this.collectionRepo.create({ name: dto.name }));
  }

  private async getCollection(id: string): Promise<Collection> {
    const collection = await this.collectionRepo.findOne({ where: { id } });
    if (!collection) throw new NotFoundException(`Collection ${id} not found`);
    return collection;
  }
}
