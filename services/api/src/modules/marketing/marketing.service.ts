import {
  BadRequestException,
  ConflictException,
  Injectable,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Campaign } from './campaign.entity';
import { CreateCampaignDto } from './dto/create-campaign.dto';

@Injectable()
export class MarketingService {
  constructor(
    @InjectRepository(Campaign) private readonly campaignRepo: Repository<Campaign>,
    @Inject(DataSource) private readonly dataSource: DataSource,
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
        spend: dto.spend ?? 0,
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

  /**
   * Campaign ROI (appendix 16 "marketing/source performance"): paid revenue
   * during the campaign window attributed by the order source tag matching the
   * campaign name or channel, compared with the money spent on it.
   */
  async roi() {
    const campaigns = await this.campaignRepo.find({ order: { startDate: 'DESC' } });
    const rows: Array<{
      id: string;
      name: string;
      type: string;
      channel: string | null;
      spend: number;
      orders: number;
      revenue: number;
      roi: number | null;
    }> = [];
    for (const c of campaigns) {
      const agg = await this.dataSource.query(
        `SELECT COUNT(*) AS orders,
                COALESCE(SUM(o.total_amount), 0) AS revenue
         FROM orders o
         WHERE o.payment_status = 'paid'
           AND o.status != 'cancelled'
           AND o.created_at::date BETWEEN $1 AND $2
           AND (o.campaign_id = $5
                OR LOWER(o.source) = LOWER($3)
                OR ($4::text IS NOT NULL AND LOWER(o.source) = LOWER($4)))`,
        [c.startDate, c.endDate, c.name, c.channel, c.id],
      );
      const orders = parseInt(String(agg[0]?.orders ?? '0'), 10) || 0;
      const revenue = Math.round((parseFloat(String(agg[0]?.revenue ?? '0')) || 0) * 100) / 100;
      const spend = Math.round((c.spend ?? 0) * 100) / 100;
      const roi = spend > 0 ? Math.round(((revenue - spend) / spend) * 1000) / 10 : null;
      rows.push({
        id: c.id,
        name: c.name,
        type: c.type,
        channel: c.channel,
        spend,
        orders,
        revenue,
        roi,
      });
    }
    const attributedRevenue =
      Math.round(rows.reduce((sum, r) => sum + r.revenue, 0) * 100) / 100;
    const totalSpend = Math.round(rows.reduce((sum, r) => sum + r.spend, 0) * 100) / 100;

    // Revenue with no tracked campaign id is reported on its own, so untagged
    // sales are never mistaken for campaign success (plan item 12).
    let unattributedRevenue = 0;
    if (campaigns.length > 0) {
      const start = campaigns.reduce((min, c) => (c.startDate < min ? c.startDate : min), campaigns[0].startDate);
      const end = campaigns.reduce((max, c) => (c.endDate > max ? c.endDate : max), campaigns[0].endDate);
      const untagged = await this.dataSource.query(
        `SELECT COALESCE(SUM(o.total_amount), 0) AS revenue
         FROM orders o
         WHERE o.payment_status = 'paid'
           AND o.status != 'cancelled'
           AND o.campaign_id IS NULL
           AND o.created_at::date BETWEEN $1 AND $2`,
        [start, end],
      );
      unattributedRevenue = Math.round((parseFloat(String(untagged[0]?.revenue ?? '0')) || 0) * 100) / 100;
    }

    return {
      campaigns: rows,
      attributedRevenue,
      unattributedRevenue,
      spend: totalSpend,
      roi:
        totalSpend > 0
          ? Math.round(((attributedRevenue - totalSpend) / totalSpend) * 1000) / 10
          : null,
    };
  }
}
