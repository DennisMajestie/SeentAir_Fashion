import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApprovalActionType } from '../../common/enums';
import { ApprovalsService } from '../approvals/approvals.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Collection } from './entities/collection.entity';
import { Product } from './entities/product.entity';
import { ProductVariant } from './entities/product-variant.entity';

@Injectable()
export class CatalogueService {
  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductVariant) private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(Collection) private readonly collectionRepo: Repository<Collection>,
    private readonly approvalsService: ApprovalsService,
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
      relations: { product: true },
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
    });
    return this.variantRepo.save(variant);
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
