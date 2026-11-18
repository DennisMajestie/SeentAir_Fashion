import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { RecommendationsService } from './recommendations.service';

describe('RecommendationsService', () => {
  let service: RecommendationsService;
  const dataSource = {
    query: jest.fn<Promise<Array<Record<string, string>>>, [string, ...unknown[]]>(
      async () => [],
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecommendationsService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = moduleRef.get(RecommendationsService);
  });

  it('ranks products bought together on paid orders', async () => {
    dataSource.query.mockResolvedValueOnce([
      { product_id: 'p2', score: '5' },
      { product_id: 'p3', score: '2' },
    ]);

    const result = await service.forProduct('p1');

    expect(dataSource.query).toHaveBeenCalledTimes(1);
    expect(dataSource.query.mock.calls[0][1]).toEqual(['p1', 4]);
    expect(result).toEqual([
      { productId: 'p2', score: 5 },
      { productId: 'p3', score: 2 },
    ]);
  });

  it('falls back to overall popular products when nothing was bought together', async () => {
    dataSource.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ product_id: 'p4', score: '9' }]);

    const result = await service.forProduct('p1', 3);

    expect(dataSource.query).toHaveBeenCalledTimes(2);
    expect(dataSource.query.mock.calls[1][1]).toEqual(['p1', 3]);
    expect(result).toEqual([{ productId: 'p4', score: 9 }]);
  });
});
