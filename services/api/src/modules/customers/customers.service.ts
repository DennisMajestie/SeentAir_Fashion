import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from './entities/customer.entity';

export interface CustomerFilters {
  page: number;
  limit: number;
  kind?: 'stockist' | 'shopper';
  tag?: string;
}

export interface BuyProduct {
  productId: string;
  name: string;
  units: number;
}

export interface CustomerAggregate {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  region: string | null;
  kind: string;
  createdAt: string;
  tags: string[] | null;
  orders: number;
  totalSpend: number;
  monthSpend: number;
  paidOrderCount: number;
  averageOrderValue: number;
  outstandingBalance: number;
  lastOrderAt: string | null;
  spendByMonth: { month: string; total: number }[];
  mostBought: BuyProduct[];
}

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
  ) {}

  async findAll(
    page: number,
    limit: number,
    kind?: 'stockist' | 'shopper',
    tag?: string,
  ): Promise<{ data: Customer[]; total: number }> {
    const query = this.customerRepo.createQueryBuilder('customer');

    if (kind) {
      query.andWhere('customer.kind = :kind', { kind });
    }

    if (tag) {
      query.andWhere('customer.tags @> ARRAY[:tag]::text[]', { tag });
    }

    const [data, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('customer.createdAt', 'DESC')
      .getManyAndCount();

    return {
      data: data.map((customer) => ({
        ...customer,
        since: customer.createdAt,
      })),
      total,
    };
  }

  async findById(id: string): Promise<Customer> {
    const customer = await this.customerRepo.findOne({ where: { id } });
    if (!customer) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
    return customer;
  }

  /**
   * Aggregate everything about one customer: lifetime spend, monthly series,
   * order counts, balance, and most-bought products. Computed from orders +
   * order_items so it is always consistent with the source of truth.
   */
  async aggregate(id: string): Promise<CustomerAggregate> {
    const customer = await this.findById(id);

    const orders = await this.customerRepo.manager
      .createQueryBuilder('order', 'order')
      .leftJoinAndSelect('order.items', 'item')
      .leftJoinAndSelect('item.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .where('order.customer_id = :id', { id })
      .orderBy('order.created_at', 'DESC')
      .getMany();

    const paidOrders = orders.filter((o) => o.paymentStatus === 'paid');
    const cancelledOrRefunded = orders.filter(
      (o) => o.status === 'cancelled' || o.paymentStatus === 'refunded',
    );

    const totalSpend = paidOrders.reduce((a, o) => a + o.totalAmount, 0);
    const paidOrderCount = paidOrders.length;
    const outstandingBalance = cancelledOrRefunded.reduce(
      (a, o) => a + o.totalAmount,
      0);
    const lastOrder = paidOrders.length > 0 ? paidOrders[0] : null;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthSpend = paidOrders
      .filter((o) => new Date(o.createdAt) >= monthStart)
      .reduce((a, o) => a + o.totalAmount, 0);

    const spendByMonth: { month: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = d.toISOString().slice(0, 7);
      const total = paidOrders
        .filter((o) => {
          const c2 = new Date(o.createdAt);
          return c2.getFullYear() === d.getFullYear() && c2.getMonth() === d.getMonth();
        })
        .reduce((a, o) => a + o.totalAmount, 0);
      spendByMonth.push({ month: monthKey, total: Math.round(total * 100) / 100 });
    }

    const productUsage = new Map<string, { productId: string; name: string; units: number }>();
    for (const order of paidOrders) {
      for (const item of order.items ?? []) {
        const key = item.variant.id;
        const existing = productUsage.get(key);
        if (existing) {
          existing.units += item.quantity;
        } else {
          productUsage.set(key, {
            productId: item.variant.id,
            name: item.variant.product?.name || item.variant.sku,
            units: item.quantity,
          });
        }
      }
    }
    const mostBought = Array.from(productUsage.values())
      .sort((a, b) => b.units - a.units)
      .slice(0, 5);

    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      city: customer.city,
      region: customer.region,
      kind: customer.kind,
      createdAt: customer.createdAt.toISOString(),
      tags: customer.tags,
      orders: orders.length,
      totalSpend: Math.round(totalSpend * 100) / 100,
      monthSpend: Math.round(monthSpend * 100) / 100,
      paidOrderCount,
      averageOrderValue: paidOrderCount > 0 ? Math.round((totalSpend / paidOrderCount) * 100) / 100 : 0,
      outstandingBalance: Math.round(outstandingBalance * 100) / 100,
      lastOrderAt: lastOrder?.createdAt.toISOString() ?? null,
      spendByMonth,
      mostBought,
    };
  }
}
