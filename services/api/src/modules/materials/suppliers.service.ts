import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { Supplier } from './entities/supplier.entity';

export interface SupplierWithPerformance extends Supplier {
  purchaseCount: number;
  averageLeadTimeDays: number | null;
}

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
  ) {}

  async findAll(): Promise<SupplierWithPerformance[]> {
    const suppliers = await this.supplierRepo.find({ order: { name: 'ASC' } });
    return Promise.all(suppliers.map((s) => this.withPerformance(s)));
  }

  async findById(id: string): Promise<SupplierWithPerformance> {
    const supplier = await this.supplierRepo.findOne({ where: { id } });
    if (!supplier) throw new NotFoundException(`Supplier ${id} not found`);
    return this.withPerformance(supplier);
  }

  async create(dto: CreateSupplierDto): Promise<SupplierWithPerformance> {
    const supplier = await this.supplierRepo.save(
      this.supplierRepo.create({
        name: dto.name,
        category: dto.category ?? null,
        location: dto.location ?? null,
        certified: dto.certified ?? false,
        slaScore: dto.slaScore ?? null,
        quotaUnits: dto.quotaUnits ?? 0,
        complianceNotes: dto.complianceNotes ?? null,
      }),
    );
    return this.withPerformance(supplier);
  }

  async update(id: string, dto: UpdateSupplierDto): Promise<SupplierWithPerformance> {
    const supplier = await this.supplierRepo.findOne({ where: { id } });
    if (!supplier) throw new NotFoundException(`Supplier ${id} not found`);
    Object.assign(supplier, {
      name: dto.name ?? supplier.name,
      category: dto.category !== undefined ? dto.category : supplier.category,
      location: dto.location !== undefined ? dto.location : supplier.location,
      certified: dto.certified ?? supplier.certified,
      slaScore: dto.slaScore !== undefined ? dto.slaScore : supplier.slaScore,
      quotaUnits: dto.quotaUnits ?? supplier.quotaUnits,
      complianceNotes:
        dto.complianceNotes !== undefined ? dto.complianceNotes : supplier.complianceNotes,
    });
    await this.supplierRepo.save(supplier);
    return this.withPerformance(supplier);
  }

  async remove(id: string): Promise<void> {
    const supplier = await this.supplierRepo.findOne({ where: { id } });
    if (!supplier) throw new NotFoundException(`Supplier ${id} not found`);
    await this.supplierRepo.remove(supplier);
  }

  /** SLA/performance from material_purchases that named this supplier. */
  private async withPerformance(supplier: Supplier): Promise<SupplierWithPerformance> {
    const purchases = await this.supplierRepo.query(
      `SELECT count(*)::int AS count, avg(lead_time_days)::float AS avg_lead
       FROM material_purchases
       WHERE supplier_name = $1`,
      [supplier.name],
    );
    const row = purchases[0];
    return {
      ...supplier,
      purchaseCount: row?.count ?? 0,
      averageLeadTimeDays: row?.avg_lead ?? null,
    };
  }
}