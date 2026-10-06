import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { ApprovalActionType } from '../../common/enums';
import { ApprovalsService } from '../approvals/approvals.service';
import { TechPack } from '../tech-packs/tech-pack.entity';
import { CatalogueService } from './catalogue.service';
import { Collection } from './entities/collection.entity';
import { Product } from './entities/product.entity';
import { ProductBomItem } from './entities/product-bom-item.entity';
import { ProductVariant } from './entities/product-variant.entity';

/**
 * Timed sales. A sale is a price change, so the cases that matter are the
 * gate: no approval, the wrong approval, and an approval for a different sale
 * must all be refused before anything is written.
 */
describe('CatalogueService — timed sales', () => {
  let service: CatalogueService;
  const HOUR = 3_600_000;
  const endsAt = new Date(Date.now() + 48 * HOUR).toISOString();

  let stored: Record<string, unknown>;
  const productRepo = {
    findOne: jest.fn(async () => ({ ...stored })),
    create: jest.fn((v) => v),
    save: jest.fn(async (v: Record<string, unknown>) => {
      stored = { ...v };
      return v;
    }),
    findAndCount: jest.fn(async () => [[{ ...stored }], 1]),
  };
  const emptyRepo = { findOne: jest.fn(), find: jest.fn(), create: jest.fn(), save: jest.fn() };
  const approvalsService = { assertApproved: jest.fn(), findApproved: jest.fn() };
  const dataSource = { transaction: jest.fn(), query: jest.fn(async () => []) };

  /** The approved request an honest admin screen would have raised. */
  const approvedFor = (over: Record<string, unknown> = {}) => ({
    id: 'req-1',
    payload: { kind: 'sale', productId: 'p1', salePercent: 20, saleEndsAt: endsAt, ...over },
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    stored = {
      id: 'p1',
      name: 'Tee',
      basePrice: 5000,
      salePercent: null,
      saleEndsAt: null,
      variants: [],
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CatalogueService,
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(ProductVariant), useValue: emptyRepo },
        { provide: getRepositoryToken(Collection), useValue: emptyRepo },
        { provide: getRepositoryToken(ProductBomItem), useValue: emptyRepo },
        { provide: getRepositoryToken(TechPack), useValue: emptyRepo },
        { provide: ApprovalsService, useValue: approvalsService },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();
    service = moduleRef.get(CatalogueService);
  });

  const dto = (over: Record<string, unknown> = {}) => ({
    percent: 20,
    endsAt,
    approvalRequestId: 'req-1',
    ...over,
  });

  it('starts the sale when the approved request covers exactly this sale', async () => {
    approvalsService.findApproved.mockResolvedValue(approvedFor());
    const product = await service.setSale('p1', dto());

    expect(approvalsService.findApproved).toHaveBeenCalledWith(
      'req-1',
      ApprovalActionType.PRICE_CHANGE,
    );
    expect(product.salePercent).toBe(20);
    expect(product.salePrice).toBe(4000);
    // The normal price is never overwritten by a sale.
    expect(product.basePrice).toBe(5000);
  });

  it('refuses when the request is not approved, and writes nothing', async () => {
    approvalsService.findApproved.mockRejectedValue(new ForbiddenException('pending'));
    await expect(service.setSale('p1', dto())).rejects.toThrow(ForbiddenException);
    expect(productRepo.save).not.toHaveBeenCalled();
  });

  it('refuses an approval that was given for a different product', async () => {
    approvalsService.findApproved.mockResolvedValue(approvedFor({ productId: 'p2' }));
    await expect(service.setSale('p1', dto())).rejects.toThrow(ForbiddenException);
    expect(productRepo.save).not.toHaveBeenCalled();
  });

  it('refuses a deeper discount than the one approved', async () => {
    approvalsService.findApproved.mockResolvedValue(approvedFor());
    await expect(service.setSale('p1', dto({ percent: 50 }))).rejects.toThrow(ForbiddenException);
    expect(productRepo.save).not.toHaveBeenCalled();
  });

  it('refuses a longer sale than the one approved', async () => {
    approvalsService.findApproved.mockResolvedValue(approvedFor());
    const longer = new Date(Date.now() + 30 * 24 * HOUR).toISOString();
    await expect(service.setSale('p1', dto({ endsAt: longer }))).rejects.toThrow(
      ForbiddenException,
    );
    expect(productRepo.save).not.toHaveBeenCalled();
  });

  it('refuses an ordinary price-change approval that never mentioned a sale', async () => {
    approvalsService.findApproved.mockResolvedValue({
      id: 'req-1',
      payload: { productId: 'p1', from: 5000, to: 4000 },
    });
    await expect(service.setSale('p1', dto())).rejects.toThrow(ForbiddenException);
    expect(productRepo.save).not.toHaveBeenCalled();
  });

  it('refuses an end time in the past before looking at the approval', async () => {
    const past = new Date(Date.now() - HOUR).toISOString();
    await expect(service.setSale('p1', dto({ endsAt: past }))).rejects.toThrow(
      BadRequestException,
    );
    expect(approvalsService.findApproved).not.toHaveBeenCalled();
  });

  it('ends a sale early without an approval and restores the normal price', async () => {
    stored = { ...stored, salePercent: 20, saleEndsAt: new Date(endsAt) };
    const product = await service.endSale('p1');

    expect(product.salePercent).toBeNull();
    expect(product.saleEndsAt).toBeNull();
    expect(product.salePrice).toBeNull();
    expect(product.basePrice).toBe(5000);
    expect(approvalsService.findApproved).not.toHaveBeenCalled();
  });

  it('publishes no sale price once the end time has passed', async () => {
    stored = { ...stored, salePercent: 20, saleEndsAt: new Date(Date.now() - HOUR) };
    const { data } = await service.findAll();
    expect(data[0].salePrice).toBeNull();
  });

  it('publishes the sale price on the public list while the sale runs', async () => {
    stored = { ...stored, salePercent: 20, saleEndsAt: new Date(endsAt) };
    const { data } = await service.findAll();
    expect(data[0].salePrice).toBe(4000);
  });
});
