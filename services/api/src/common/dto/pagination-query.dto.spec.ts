import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PaginationQueryDto } from './pagination-query.dto';

describe('PaginationQueryDto validation', () => {
  it('accepts valid page and limit', async () => {
    const dto = plainToInstance(PaginationQueryDto, { page: '1', limit: '20' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('defaults page and limit to undefined when absent', async () => {
    const dto = plainToInstance(PaginationQueryDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBeUndefined();
    expect(dto.limit).toBeUndefined();
  });

  it('rejects limit above 100 with 400-level validation error', async () => {
    const dto = plainToInstance(PaginationQueryDto, { page: '1', limit: '1000' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const limitError = errors.find((e) => e.property === 'limit');
    expect(limitError).toBeDefined();
    expect(limitError?.constraints).toMatchObject({
      max: expect.stringContaining('100'),
    });
  });

  it('rejects page 0', async () => {
    const dto = plainToInstance(PaginationQueryDto, { page: '0', limit: '20' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const pageError = errors.find((e) => e.property === 'page');
    expect(pageError).toBeDefined();
    expect(pageError?.constraints).toMatchObject({
      min: expect.stringContaining('1'),
    });
  });

  it('rejects non-integer page', async () => {
    const dto = plainToInstance(PaginationQueryDto, { page: '1.5', limit: '20' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const pageError = errors.find((e) => e.property === 'page');
    expect(pageError).toBeDefined();
  });

  it('rejects non-integer limit', async () => {
    const dto = plainToInstance(PaginationQueryDto, { page: '1', limit: 'abc' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const limitError = errors.find((e) => e.property === 'limit');
    expect(limitError).toBeDefined();
  });

  it('accepts limit exactly 100', async () => {
    const dto = plainToInstance(PaginationQueryDto, { page: '1', limit: '100' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.limit).toBe(100);
  });

  it('accepts page exactly 1', async () => {
    const dto = plainToInstance(PaginationQueryDto, { page: '1', limit: '20' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
  });
});
