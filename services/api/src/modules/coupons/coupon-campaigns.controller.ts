import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CouponsService } from './coupons.service';
import { CouponCampaignPlacement } from './entities/coupon-campaign.entity';

/**
 * The public campaign banner feed.
 *
 * Public because a teaser banner is meant to be seen before signing in - but the
 * only thing it exposes is marketing copy, a window and the server's clock. No
 * coupon code is returned here: the code is what the claim endpoint is for, and
 * publishing it in a public payload would hand out coupons to anyone who wanted
 * to scrape the page.
 */
@Controller('coupon-campaigns')
export class CouponCampaignsController {
  constructor(private readonly coupons: CouponsService) {}

  @Public()
  @Get('active')
  active(@Query('placement') placement?: string) {
    return this.coupons.activeCampaign(
      placement ?? CouponCampaignPlacement.HOME_TOP,
      new Date(),
    );
  }
}
