import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign } from './campaign.entity';
import { CreateCampaignDto } from './dto/create-campaign.dto';

@Injectable()
export class MarketingService {
  constructor(
    @InjectRepository(Campaign) private readonly campaignRepo: Repository<Campaign>,
  ) {}

  async create(dto: CreateCampaignDto): Promise<Campaign> {
    if (new Date(dto.endDate) <= new Date(dto.startDate)) {
      throw new BadRequestException('endDate must be after startDate');
    }
    const existing = await this.campaignRepo.findOne({ where: { name: dto.name } });
    if (existing) throw new ConflictException(`Campaign '${dto.name}' already exists`);
    return this.campaignRepo.save(
      this.campaignRepo.create({
        name: dto.name,
        type: dto.type,
        channel: dto.channel ?? null,
        discountPercent: dto.discountPercent ?? null,
        startDate: dto.startDate,
        endDate: dto.endDate,
      }),
    );
  }

  async findAll(activeOnly = false): Promise<Campaign[]> {
    if (!activeOnly) return this.campaignRepo.find({ order: { startDate: 'DESC' } });
    const today = new Date().toISOString().slice(0, 10);
    return this.campaignRepo
      .createQueryBuilder('c')
      .where('c.start_date <= :today AND c.end_date >= :today', { today })
      .orderBy('c.start_date', 'DESC')
      .getMany();
  }
}
