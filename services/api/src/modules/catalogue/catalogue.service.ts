import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ApprovalActionType } from '../../common/enums';
import { ApprovalsService } from '../approvals/approvals.service';
import { TechPack } from '../tech-packs/tech-pack.entity';
import { ReplaceBomDto } from './dto/bom.dto';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { SetSaleDto } from './dto/set-sale.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { Collection } from './entities/collection.entity';
import { ProductBomItem } from './entities/product-bom-item.entity';
import { Product } from './entities/product.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { retailUnitPrice } from './sale-pricing';

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
    await this.attachSoldCounts(data);
    for (const p of data) this.attachSalePrice(p);
    return { data, total };
  }

  /** Derives `salePrice` for the response: the discounted base price, or null. */
  private attachSalePrice(product: Product): void {
    const price = retailUnitPrice(product.basePrice, product);
    product.salePrice = price === product.basePrice ? null : price;
  }

  /**
   * Attaches the public "N bought" figure to the products about to be returned
   * to the storefront. See salesCounts() for what the number means.
   */
  private async attachSoldCounts(products: Product[]): Promise<void> {
    if (products.length === 0) return;
    const counts = await this.salesCounts(products.map((p) => p.id));
    for (const p of products) p.soldCount = counts.get(p.id) ?? 0;
  }

  /**
   * Number of DISTINCT paid orders containing each product.
   *
   * Deliberately counts orders, not units: the storefront wording is "N people
   * bought this", and one customer buying three shirts is one buyer. It is also
   * the more conservative number to publish — a per-order count cannot be walked
   * back into basket contents or spend the way a units/revenue figure can.
   *
   * Scoped to paid orders, excluding cancelled and returned ones, so an unpaid
   * or abandoned checkout can never inflate a product's popularity. Products
   * with no qualifying sales are absent from the map; callers treat that as 0.
   *
   * This is the public, aggregate-only counterpart of the owner-facing
   * analytics best-seller report, which stays behind ANALYTICS.VIEW because it
   * also exposes revenue and per-variant SKU detail.
   */
  async salesCounts(productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();
    const rows = await this.dataSource.query(
      `SELECT v.product_id AS product_id, COUNT(DISTINCT oi.order_id) AS buyers
         FROM order_items oi
         JOIN product_variants v ON v.id = oi.variant_id
         JOIN orders o ON o.id = oi.order_id
        WHERE v.product_id = ANY($1::uuid[])
          AND o.payment_status = 'paid'
          AND o.status::text <> ALL($2::text[])
        GROUP BY v.product_id`,
      [productIds, ['cancelled', 'returned']],
    );
    const counts = new Map<string, number>();
    for (const row of rows as Array<{ product_id: string; buyers: string }>) {
      counts.set(row.product_id, parseInt(row.buyers, 10) || 0);
    }
    return counts;
  }

  async findById(id: string): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: { variants: true },
    });
    if (!product) throw new NotFoundException(`Product ${id} not found`);
    product.soldCount = (await this.salesCounts([id])).get(id) ?? 0;
    this.attachSalePrice(product);
    return product;
  }

  /**
   * Fetch several variants in one query, keyed by variant id.
   *
   * Used by the wholesale availability endpoint, which is given variant ids
   * but needs each one's `availabilityStatus` before deciding whether to
   * report a derived stock number. Unknown ids are simply absent from the map
   * rather than throwing, so one bad id cannot break a whole batch.
   */
  async findVariantsByIds(ids: string[]): Promise<Map<string, ProductVariant>> {
    if (ids.length === 0) return new Map();
    const variants = await this.variantRepo.find({ where: { id: In(ids) } });
    return new Map(variants.map((v) => [v.id, v]));
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

  /**
   * Put a product on a timed sale.
   *
   * A sale is a price change, so it sits behind the same server-side gate as
   * editing the base price (architectural principle #3) -- and a tighter one:
   * the approved request must be for THIS product at THIS discount until THIS
   * end time. Approval of one sale cannot be spent on a deeper or longer one,
   * or on a different product.
   */
  async setSale(id: string, dto: SetSaleDto): Promise<Product> {
    const product = await this.findById(id);
    const endsAt = new Date(dto.endsAt);
    if (endsAt.getTime() <= Date.now()) {
      throw new BadRequestException('A sale must end in the future');
    }

    const request = await this.approvalsService.findApproved(
      dto.approvalRequestId,
      ApprovalActionType.PRICE_CHANGE,
    );
    const approved = (request.payload ?? {}) as Record<string, unknown>;
    const approvedEnd = new Date(String(approved['saleEndsAt'] ?? '')).getTime();
    if (
      approved['kind'] !== 'sale' ||
      approved['productId'] !== id ||
      Number(approved['salePercent']) !== dto.percent ||
      approvedEnd !== endsAt.getTime()
    ) {
      throw new ForbiddenException(
        'The approved request does not cover this sale (product, discount and end time must match)',
      );
    }

    product.salePercent = dto.percent;
    product.saleEndsAt = endsAt;
    await this.productRepo.save(product);
    return this.findById(id);
  }

  /**
   * End a sale early. Not approval-gated: it returns the product to its
   * already-approved base price, it does not set a new one.
   */
  async endSale(id: string): Promise<Product> {
    const product = await this.findById(id);
    product.salePercent = null;
    product.saleEndsAt = null;
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
