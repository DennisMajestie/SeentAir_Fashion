import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RecommendationsService } from './recommendations.service';

@ApiTags('Recommendations')
@Controller()
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  /** "Customers also bought" for a product page; public, like the catalogue. */
  @Public()
  @Get('products/:id/recommendations')
  forProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit = '4',
  ) {
    return this.recommendations.forProduct(id, Math.min(parseInt(limit, 10) || 4, 12));
  }
}
