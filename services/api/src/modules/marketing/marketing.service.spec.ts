import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Campaign, CampaignType } from './campaign.entity';
import { MarketingService } from './marketing.service';

describe('MarketingService', () => {
  let service: MarketingService;
  const repo = {
    findOne: jest.fn(async () => null as unknown),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
    find: jest.fn<Promise<unknown[]>, [unknown?]>(async () => []),
  };
  const dataSource = {
    query: jest.fn<Promise<Array<Record<string, unknown>>>, [string, ...unknown[]]>(
      async () => [],
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        MarketingService,
        { provide: getRepositoryToken(Campaign), useValue: repo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = moduleRef.get(MarketingService);
  });

  it('rejects a campaign whose end date is not after its start date', async () => {
    await expect(
      service.create({
        name: 'Xmas drop',
        type: CampaignType.PROMOTION,
        startDate: '2026-12-20',
        endDate: '2026-12-20',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects duplicate campaign names', async () => {
    repo.findOne.mockResolvedValue({ id: 'c1' });
    await expect(
      service.create({
        name: 'Xmas drop',
        type: CampaignType.PROMOTION,
        startDate: '2026-12-01',
        endDate: '2026-12-31',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('creates a valid campaign', async () => {
    repo.findOne.mockResolvedValue(null);
    const campaign = await service.create({
      name: 'Xmas drop',
      type: CampaignType.PROMOTION,
      channel: 'instagram',
      discountPercent: 10,
      startDate: '2026-12-01',
      endDate: '2026-12-31',
    });
    expect(campaign).toEqual(
      expect.objectContaining({ name: 'Xmas drop', channel: 'instagram', discountPercent: 10 }),
    );
  });

  it('creates a campaign with the spend recorded for ROI', async () => {
    repo.findOne.mockResolvedValue(null);
    const campaign = await service.create({
      name: 'TikTok push',
      type: CampaignType.CAMPAIGN,
      spend: 45000,
      startDate: '2026-12-01',
      endDate: '2026-12-31',
    });
    expect(campaign).toEqual(expect.objectContaining({ name: 'TikTok push', spend: 45000 }));
  });

  it('attributes paid orders to a campaign window and computes ROI', async () => {
    repo.find.mockResolvedValue([
      {
        id: 'c1',
        name: 'Xmas drop',
        type: CampaignType.PROMOTION,
        channel: 'instagram',
        spend: 40000,
        startDate: '2026-12-01',
        endDate: '2026-12-31',
      },
    ]);
    dataSource.query.mockResolvedValueOnce([{ orders: '6', revenue: '180000' }]);

    const result = await service.roi();

    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('payment_status'), [
      '2026-12-01',
      '2026-12-31',
      'Xmas drop',
      'instagram',
    ]);
    expect(result.campaigns).toEqual([
      {
        id: 'c1',
        name: 'Xmas drop',
        type: 'promotion',
        channel: 'instagram',
        spend: 40000,
        orders: 6,
        revenue: 180000,
        roi: 350,
      },
    ]);
    expect(result.attributedRevenue).toBe(180000);
    expect(result.spend).toBe(40000);
    expect(result.roi).toBe(350);
  });

  it('reports null ROI for campaigns with nothing spent yet', async () => {
    repo.find.mockResolvedValue([
      {
        id: 'c2',
        name: 'Loyalty push',
        type: CampaignType.LOYALTY,
        channel: null,
        spend: 0,
        startDate: '2026-12-01',
        endDate: '2026-12-31',
      },
    ]);
    dataSource.query.mockResolvedValueOnce([{ orders: '0', revenue: '0' }]);

    const result = await service.roi();

    expect(result.campaigns[0].roi).toBeNull();
    expect(result.roi).toBeNull();
    expect(result.attributedRevenue).toBe(0);
  });
});
