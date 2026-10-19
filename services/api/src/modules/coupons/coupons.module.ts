import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { CheckoutShippingModule } from '../checkout-shipping/checkout-shipping.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { CouponCampaignsController } from './coupon-campaigns.controller';
import { CouponCampaign } from './entities/coupon-campaign.entity';
import { CouponBundle, CouponBundleItem } from './entities/coupon-bundle.entity';
import { Coupon } from './entities/coupon.entity';
import { CouponRedemption, CustomerCoupon } from './entities/customer-coupon.entity';
import { CouponsAdminController } from './coupons-admin.controller';
import { CouponsAdminService } from './coupons-admin.service';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';

/**
 * Coupons live under their own `coupons/*` routes and never widen `logistics/*`.
 *
 * The feature is switched on from the shared platform settings row with an env
 * kill-switch on top, and it ships off: with the flag off every read returns an
 * empty or explicitly disabled result and nothing is written.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Coupon,
      CouponBundle,
      CouponBundleItem,
      CustomerCoupon,
      CouponRedemption,
      CouponCampaign,
    ]),
    PlatformSettingsModule,
    AuditModule,
    CheckoutShippingModule,
  ],
  controllers: [CouponsController, CouponCampaignsController, CouponsAdminController],
  providers: [CouponsService, CouponsAdminService],
  exports: [CouponsService],
})
export class CouponsModule {}