import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { ApprovalActionType } from '../../common/enums';
import { ApprovalsService } from '../approvals/approvals.service';
import { TechPack } from '../tech-packs/tech-pack.entity';
import { CatalogueService } from './catalogue.service';
import { Category } from './entities/category.entity';
import { Collection } from './entities/collection.entity';
import { Product } from './entities/product.entity';
import { ProductBomItem } from './entities/product-bom-item.entity';
import { ProductVariant } from './entities/product-variant.entity';

describe('CatalogueService — price-change approval gate', () => {
  let service: CatalogueService;
  const product = { id: 'p1', name: 'Tee', basePrice: 5000, variants: [] };

  const productRepo = {
    findOne: jest.fn(async () => ({ ...product })),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
    findAndCount: jest.fn(async () => [[], 0]),
  };
  const emptyRepo = { findOne: jest.fn(), find: jest.fn(), create: jest.fn(), save: jest.fn() };
  const approvalsService = { assertApproved: jest.fn() };
  const dataSource = {
    transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) =>
      fn({ getRepository: () => emptyRepo }),
    ),
    // Used by salesCounts() for the public "N bought" figure. Empty by default
    // so a product with no sales resolves to 0.
    query: jest.fn(async (): Promise<Array<{ product_id: string; buyers: string }>> => []),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CatalogueService,
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(ProductVariant), useValue: emptyRepo },
        { provide: getRepositoryToken(Collection), useValue: emptyRepo },
        { provide: getRepositoryToken(Category), useValue: emptyRepo },
        { provide: getRepositoryToken(ProductBomItem), useValue: emptyRepo },
        { provide: getRepositoryToken(TechPack), useValue: emptyRepo },
        { provide: ApprovalsService, useValue: approvalsService },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();
    service = moduleRef.get(CatalogueService);
  });

  it('rejects a price change without an approval request id', async () => {
    await expect(service.update('p1', { basePrice: 6000 })).rejects.toThrow(ForbiddenException);
    expect(productRepo.save).not.toHaveBeenCalled();
  });

  it('verifies the approval before applying a price change', async () => {
    approvalsService.assertApproved.mockResolvedValue(undefined);
    await service.update('p1', { basePrice: 6000, approvalRequestId: 'req-1' });
    expect(approvalsService.assertApproved).toHaveBeenCalledWith(
      'req-1',
      ApprovalActionType.PRICE_CHANGE,
    );
    expect(productRepo.save).toHaveBeenCalledWith(expect.objectContaining({ basePrice: 6000 }));
  });

  it('propagates a rejected/pending approval and does not save', async () => {
    approvalsService.assertApproved.mockRejectedValue(new ForbiddenException('not approved'));
    await expect(
      service.update('p1', { basePrice: 6000, approvalRequestId: 'req-1' }),
    ).rejects.toThrow(ForbiddenException);
    expect(productRepo.save).not.toHaveBeenCalled();
  });

  it('allows non-price edits without any approval', async () => {
    await service.update('p1', { name: 'New Tee' });
    expect(approvalsService.assertApproved).not.toHaveBeenCalled();
    expect(productRepo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Tee' }));
  });

  it('treats an unchanged basePrice as not a price change', async () => {
    await service.update('p1', { basePrice: 5000 });
    expect(approvalsService.assertApproved).not.toHaveBeenCalled();
    expect(productRepo.save).toHaveBeenCalled();
  });
});

/**
 * The product image lived on variants only, so every listing showed whatever
 * the first variant carried — or a positional stand-in. These guard the new
 * product-level photo: it is persisted on create, replaceable on update, and
 * clearable back to the variant/placeholder fallback by sending null.
 */
describe('CatalogueService — product image fields', () => {
  let service: CatalogueService;
  const product = { id: 'p1', name: 'Tee', basePrice: 5000, variants: [] };

  const productRepo = {
    findOne: jest.fn(async () => ({ ...product })),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
  };
  const variantRepo = {
    findOne: jest.fn(async () => ({ id: 'v1', name: 'Tee S' })),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
  };
  const emptyRepo = { findOne: jest.fn(), find: jest.fn(), create: jest.fn(), save: jest.fn() };
  // resolveCategory() resolves names through a query-builder lookup.
  const categoryRepo = {
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => ({ name: 'Tops' })),
    })),
  };
  const approvalsService = { assertApproved: jest.fn() };
  const dataSource = {
    transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) =>
      fn({ getRepository: () => emptyRepo }),
    ),
    query: jest.fn(async () => []),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CatalogueService,
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(ProductVariant), useValue: variantRepo },
        { provide: getRepositoryToken(Collection), useValue: emptyRepo },
        { provide: getRepositoryToken(Category), useValue: categoryRepo },
        { provide: getRepositoryToken(ProductBomItem), useValue: emptyRepo },
        { provide: getRepositoryToken(TechPack), useValue: emptyRepo },
        { provide: ApprovalsService, useValue: approvalsService },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();
    service = moduleRef.get(CatalogueService);
  });

  it('persists a primary image when creating a product', async () => {
    await service.create({
      name: 'Tee',
      category: 'Tops',
      basePrice: 5000,
      primaryImageUrl: 'https://cdn.example.com/tee.jpg',
    });
    expect(productRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ primaryImageUrl: 'https://cdn.example.com/tee.jpg' }),
    );
  });

  it('defaults to no image when creating a product without one', async () => {
    await service.create({ name: 'Tee', category: 'Tops', basePrice: 5000 });
    expect(productRepo.create).toHaveBeenCalledWith(expect.objectContaining({ primaryImageUrl: null }));
  });

  it('replaces a product primary image on update', async () => {
    await service.update('p1', { primaryImageUrl: 'https://cdn.example.com/new.jpg' });
    expect(productRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ primaryImageUrl: 'https://cdn.example.com/new.jpg' }),
    );
  });

  it('clears a product primary image when null is sent (not treated as omitted)', async () => {
    await service.update('p1', { primaryImageUrl: null });
    expect(productRepo.save).toHaveBeenCalledWith(expect.objectContaining({ primaryImageUrl: null }));
  });

  it('persists a per-variant image on updateVariant', async () => {
    await service.updateVariant('v1', { imageUrl: 'https://cdn.example.com/tee-s.jpg' });
    expect(variantRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'v1', imageUrl: 'https://cdn.example.com/tee-s.jpg' }),
    );
  });
});

/**
 * The public "N bought" figure behind the storefront's Best Sellers rail. These
 * guard the two things that would make it a lie: counting the wrong thing
 * (units/orders) and counting orders that were never paid for.
 */
describe('CatalogueService — public sold count', () => {
  let service: CatalogueService;
  const dataSource = { query: jest.fn() };
  const productRepo = { findAndCount: jest.fn(), findOne: jest.fn() };

  const build = async (): Promise<void> => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CatalogueService,
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(ProductVariant), useValue: {} },
        { provide: getRepositoryToken(Collection), useValue: {} },
        { provide: getRepositoryToken(Category), useValue: {} },
        { provide: getRepositoryToken(ProductBomItem), useValue: {} },
        { provide: getRepositoryToken(TechPack), useValue: {} },
        { provide: ApprovalsService, useValue: {} },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();
    service = moduleRef.get(CatalogueService);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    await build();
  });

  it('counts distinct paid orders and excludes cancelled or returned ones', async () => {
    dataSource.query.mockResolvedValue([{ product_id: 'p1', buyers: '7' }]);

    const counts = await service.salesCounts(['p1']);

    expect(counts.get('p1')).toBe(7);
    const [sql, params] = dataSource.query.mock.calls[0];
    // One buyer is one order, however many units that order contained.
    expect(sql).toContain('COUNT(DISTINCT oi.order_id)');
    // Unpaid, cancelled and returned orders must never inflate the number.
    expect(sql).toContain("o.payment_status = 'paid'");
    expect(params[1]).toEqual(['cancelled', 'returned']);
  });

  it('reports 0 rather than omitting the figure when nothing has sold', async () => {
    dataSource.query.mockResolvedValue([]);
    productRepo.findAndCount.mockResolvedValue([[{ id: 'p1' }, { id: 'p2' }], 2]);

    const { data } = await service.findAll();

    expect(data.map((p) => p.soldCount)).toEqual([0, 0]);
  });

  it('stamps each product with its own real count', async () => {
    dataSource.query.mockResolvedValue([{ product_id: 'p2', buyers: '3' }]);
    productRepo.findAndCount.mockResolvedValue([[{ id: 'p1' }, { id: 'p2' }], 2]);

    const { data } = await service.findAll();

    expect(data.map((p) => p.soldCount)).toEqual([0, 3]);
  });

  it('skips the query entirely for an empty page instead of sending bad SQL', async () => {
    productRepo.findAndCount.mockResolvedValue([[], 0]);

    await service.findAll();

    expect(dataSource.query).not.toHaveBeenCalled();
  });
});
