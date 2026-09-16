import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { MarketingService } from './marketing.service';

@ApiTags('Marketing')
@ApiBearerAuth()
@Controller('campaigns')
export class MarketingController {
  constructor(private readonly marketingService: MarketingService) {}

  @Get()
  @RequireAccess(ModuleName.MARKETING, AccessLevel.VIEW)
  findAll(@Query('active') active?: string) {
    return this.marketingService.findAll(active === 'true');
  }

  @Post()
  @RequireAccess(ModuleName.MARKETING, AccessLevel.FULL)
  create(@Body() dto: CreateCampaignDto) {
    return this.marketingService.create(dto);
  }
}
