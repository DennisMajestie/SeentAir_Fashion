import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ApprovalActionType } from '../../common/enums';
import { ApprovalsService } from '../approvals/approvals.service';
import { CatalogueService } from './catalogue.service';
import { Collection } from './entities/collection.entity';
import { Product } from './entities/product.entity';
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

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CatalogueService,
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(ProductVariant), useValue: emptyRepo },
        { provide: getRepositoryToken(Collection), useValue: emptyRepo },
        { provide: ApprovalsService, useValue: approvalsService },
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
