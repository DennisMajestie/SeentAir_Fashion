import { MaterialsService } from './materials.service';

describe('MaterialsService purchase listing', () => {
  const purchaseRepo = {
    findAndCount: jest.fn(async () => [[], 0]),
  };
  const service = new MaterialsService(
    {} as never,
    purchaseRepo as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('returns paginated purchases with material details, newest first', async () => {
    await service.findPurchases(2, 10);

    expect(purchaseRepo.findAndCount).toHaveBeenCalledWith({
      relations: { material: true },
      order: { purchasedAt: 'DESC' },
      skip: 10,
      take: 10,
    });
  });
});
