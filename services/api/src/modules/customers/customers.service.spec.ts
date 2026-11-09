import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CustomersService } from './customers.service';
import { Customer } from './entities/customer.entity';

describe('CustomersService — aggregate endpoint', () => {
  let service: CustomersService;
  let customerRepo: any;

  const customer = {
    id: 'c1',
    name: 'Seentair Retail Ltd',
    email: 'owner@seentair.example',
    phone: '+234 800 000 0001',
    city: 'Lagos',
    region: 'Lagos',
    kind: 'retail',
    tags: ['vip', 'partner'],
    note: '',
    createdAt: new Date('2024-01-15T10:00:00Z'),
  };

  const orders = [
    {
      id: 'o1',
      customerId: 'c1',
      status: 'delivered',
      paymentStatus: 'paid',
      totalAmount: 150000,
      createdAt: new Date('2024-02-01T10:00:00Z'),
      items: [
        { variant: { id: 'v1', product: { name: 'Ankara Wax' }, sku: 'VX-001' }, quantity: 2, unitPrice: 25000 },
        { variant: { id: 'v2', product: { name: 'Cotton Plain' }, sku: 'CT-002' }, quantity: 1, unitPrice: 100000 },
      ],
    },
    {
      id: 'o2',
      customerId: 'c1',
      status: 'shipped',
      paymentStatus: 'paid',
      totalAmount: 75000,
      createdAt: new Date('2024-02-10T10:00:00Z'),
      items: [
        { variant: { id: 'v1', product: { name: 'Ankara Wax' }, sku: 'VX-001' }, quantity: 1, unitPrice: 25000 },
        { variant: { id: 'v3', product: { name: 'Lace Material' }, sku: 'LC-003' }, quantity: 1, unitPrice: 50000 },
      ],
    },
    {
      id: 'o3',
      customerId: 'c1',
      status: 'cancelled',
      paymentStatus: 'refunded',
      totalAmount: 20000,
      createdAt: new Date('2024-02-15T10:00:00Z'),
      items: [],
    },
    {
      id: 'o4',
      customerId: 'c1',
      status: 'awaiting_payment',
      paymentStatus: 'unpaid',
      totalAmount: 30000,
      createdAt: new Date('2024-03-01T10:00:00Z'),
      items: [],
    },
  ];

  beforeEach(() => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => orders),
    };
    customerRepo = {
      findOne: jest.fn(async () => customer),
      manager: { createQueryBuilder: jest.fn(() => qb) },
    } as any;

    service = new CustomersService(customerRepo as any);
  });

  it('aggregates lifetime spend, month spend, and outstanding balance', async () => {
    const result = await service.aggregate('c1');

    expect(result.id).toBe('c1');
    expect(result.name).toBe('Seentair Retail Ltd');
    expect(result.orders).toBe(4);
    expect(result.totalSpend).toBe(225000);
    expect(result.monthSpend).toBe(0);
    expect(result.paidOrderCount).toBe(2);
    expect(result.outstandingBalance).toBe(20000);
    expect(result.averageOrderValue).toBe(112500);
  });

  it('returns most bought products sorted by units descending', async () => {
    const result = await service.aggregate('c1');

    expect(result.mostBought).toHaveLength(3);
    expect(result.mostBought[0]).toMatchObject({
      productId: 'v1',
      name: 'Ankara Wax',
      units: 3,
    });
    expect(result.mostBought[1]).toMatchObject({
      productId: 'v2',
      name: 'Cotton Plain',
      units: 1,
    });
  });

  it('returns empty mostBought when no orders', async () => {
    customerRepo.manager.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => []),
    }));
    const result = await service.aggregate('c1');

    expect(result.spendByMonth).toHaveLength(6);
    expect(result.spendByMonth.every((m) => m.total === 0)).toBe(true);
    expect(result.mostBought).toEqual([]);
  });

  it('throws NotFoundException when customer does not exist', async () => {
    customerRepo.findOne = jest.fn(async () => null);
    await expect(service.aggregate('nonexistent')).rejects.toThrow(NotFoundException);
  });
});
