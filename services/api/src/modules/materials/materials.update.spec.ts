import { ConflictException, NotFoundException } from '@nestjs/common';
import { MaterialsService } from './materials.service';

describe('MaterialsService update', () => {
  const material = {
    id: 'm-1',
    name: 'Chiffon',
    unit: 'metres',
    category: 'fabrics',
    storageLocation: 'C3-R1',
    reorderThreshold: 2,
  };

  let materialRepo: { findOne: jest.Mock; save: jest.Mock };
  let service: MaterialsService;

  beforeEach(() => {
    materialRepo = {
      findOne: jest.fn(async () => ({ ...material })),
      save: jest.fn(async (m: unknown) => m),
    };
    service = new MaterialsService(
      materialRepo as never,
      {} as never,
      {} as never,
      { currentQuantity: jest.fn(async () => 20) } as never,
      {} as never,
      {} as never,
    );
  });

  it('updates only the master fields supplied and keeps ledger-derived stock', async () => {
    const result = await service.update(material.id, { unit: 'yards', reorderThreshold: 5 });

    expect(materialRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ unit: 'yards', reorderThreshold: 5, name: 'Chiffon' }),
    );
    expect(result.currentQuantity).toBe(20);
  });

  it('clears nullable fields and rejects a duplicate name', async () => {
    const cleared = await service.update(material.id, { category: null, storageLocation: '' });
    expect(cleared.category).toBeNull();
    expect(cleared.storageLocation).toBeNull();

    materialRepo.findOne
      .mockResolvedValueOnce({ ...material })
      .mockResolvedValueOnce({ ...material, id: 'm-2' });
    await expect(service.update(material.id, { name: 'Linen' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('reports a missing material', async () => {
    materialRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.update(material.id, { unit: 'yards' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
