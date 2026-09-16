import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /** The owner's one-glance dashboard (UX requirement #5). */
  @Get('dashboard')
  @RequireAccess(ModuleName.ANALYTICS, AccessLevel.VIEW)
  dashboard() {
    return this.analyticsService.dashboard();
  }

  /** Best sellers by default; ?direction=slow for slow movers. */
  @Get('best-sellers')
  @RequireAccess(ModuleName.ANALYTICS, AccessLevel.VIEW)
  sellers(@Query('limit') limit = '10', @Query('direction') direction: 'best' | 'slow' = 'best') {
    return this.analyticsService.sellers(parseInt(limit, 10), direction);
  }

  @Get('low-stock')
  @RequireAccess(ModuleName.ANALYTICS, AccessLevel.VIEW)
  lowStock(@Query('variantThreshold') variantThreshold = '10') {
    return this.analyticsService.lowStock(parseInt(variantThreshold, 10));
  }
}
