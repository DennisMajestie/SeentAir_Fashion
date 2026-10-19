import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AccessLevel, ModuleName } from '../../common/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AuthenticatedUser } from '../../common/interfaces';
import { CouponInput, CouponsAdminService } from './coupons-admin.service';
import { CouponCampaignClaimKind, CouponCampaignPlacement } from './entities/coupon-campaign.entity';
import { CouponAudience, CouponType } from './entities/coupon.entity';
import { CustomerCouponStatus } from './entities/customer-coupon.entity';

/**
 * Everything that can change what a customer pays.
 *
 * Gated at `@RequireAccess(ModuleName.LOGISTICS, AccessLevel.FULL)` - the
 * highest level, on the controller class rather than per method, so a newly
 * added handler cannot accidentally ship unguarded. That matters here because
 * the global access guard lets a route through for ANY authenticated user when
 * it carries no `@RequireAccess`, and a coupon write left undecorated would be
 * reachable by a customer account.
 *
 * Every handler that changes money takes a `reason`, which is stored with the
 * audit entry.
 */
@Controller('coupons/admin')
@RequireAccess(ModuleName.LOGISTICS, AccessLevel.FULL)
export class CouponsAdminController {
  constructor(private readonly admin: CouponsAdminService) {}

  @Get('coupons')
  listCoupons() {
    return this.admin.listCoupons();
  }

  @Post('coupons')
  createCoupon(
    @Body() body: CouponInput & { reason: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.admin.createCoupon(body, actor, body.reason);
  }

  @Patch('coupons/:id')
  updateCoupon(
    @Param('id') id: string,
    @Body() body: Partial<CouponInput> & { reason: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.admin.updateCoupon(id, body, actor, body.reason);
  }

  @Delete('coupons/:id')
  deactivateCoupon(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser, @Body() body: { reason: string }) {
    return this.admin.deactivateCoupon(id, actor, body.reason);
  }

  @Get('bundles')
  listBundles() {
    return this.admin.listBundles();
  }

  @Post('bundles')
  createBundle(
    @Body() body: { name: string; description?: string; couponIds: string[]; reason: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.admin.createBundle(body, actor, body.reason);
  }

  @Get('campaigns')
  listCampaigns() {
    return this.admin.listCampaigns();
  }

  @Post('campaigns')
  createCampaign(
    @Body()
    body: {
      headline: string;
      badgeText?: string;
      offerText?: string;
      labelText?: string;
      startsAt: string;
      endsAt: string;
      claimKind: CouponCampaignClaimKind;
      couponId?: string;
      bundleId?: string;
      placement?: CouponCampaignPlacement;
      reason: string;
    },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.admin.createCampaign(
      {
        ...body,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
      },
      actor,
      body.reason,
    );
  }

  @Delete('campaigns/:id')
  deactivateCampaign(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser, @Body() body: { reason: string }) {
    return this.admin.deactivateCampaign(id, actor, body.reason);
  }

  @Post('coupons/:id/issue')
  issue(
    @Param('id') id: string,
    @Body() body: { customerIds: string[]; expiresAt?: string; reason: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.admin.issue(id, body.customerIds, body.expiresAt ? new Date(body.expiresAt) : null, actor, body.reason);
  }

  @Get('report')
  report() {
    return this.admin.report();
  }

  @Patch('wallet/:id')
  setWalletStatus(
    @Param('id') id: string,
    @Body() body: { status: CustomerCouponStatus; reason: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.admin.setWalletStatus(id, body.status, actor, body.reason);
  }
}

/** Enum values the dashboard needs, exported so it cannot guess a spelling. */
export const COUPON_ENUMS = {
  type: CouponType,
  audience: CouponAudience,
  claimKind: CouponCampaignClaimKind,
  placement: CouponCampaignPlacement,
  walletStatus: CustomerCouponStatus,
};
