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
}
