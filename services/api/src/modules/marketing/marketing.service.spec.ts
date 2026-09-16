import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Campaign, CampaignType } from './campaign.entity';
import { MarketingService } from './marketing.service';

describe('MarketingService', () => {
  let service: MarketingService;
  const repo = {
    findOne: jest.fn(async () => null as unknown),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
    find: jest.fn(async () => []),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [MarketingService, { provide: getRepositoryToken(Campaign), useValue: repo }],
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
});
