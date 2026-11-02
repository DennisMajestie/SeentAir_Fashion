import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BestSellersQueryDto } from './best-sellers-query.dto';

describe('BestSellersQueryDto', () => {
  it('accepts and transforms pagination and direction parameters', async () => {
    const query = plainToInstance(BestSellersQueryDto, {
      limit: '10',
      direction: 'slow',
    });

    expect(query.limit).toBe(10);
    expect(await validate(query)).toEqual([]);
  });

  it('rejects unsupported directions', async () => {
    const query = plainToInstance(BestSellersQueryDto, { direction: 'sideways' });

    expect(await validate(query)).not.toEqual([]);
  });
});
