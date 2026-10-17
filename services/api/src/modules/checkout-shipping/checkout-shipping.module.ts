import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { CheckoutShippingAdminController } from './checkout-shipping-admin.controller';
import { CheckoutShippingAdminService } from './checkout-shipping-admin.service';
import { CheckoutShippingController } from './checkout-shipping.controller';
import { CheckoutShippingService, ZONE_RATE_PROVIDER } from './checkout-shipping.service';
import { CheckoutShippingRate } from './entities/checkout-shipping-rate.entity';
import { CheckoutShippingZoneState } from './entities/checkout-shipping-zone-state.entity';
import { CheckoutShippingZone } from './entities/checkout-shipping-zone.entity';
import { DatabaseZoneRateProvider } from './zone-rate.provider';

/**
 * Customer-facing delivery pricing, kept separate from the internal logistics
 * module on purpose. Routes live under `checkout-shipping` so nothing here can
 * widen or be confused with `logistics/*`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CheckoutShippingZone,
      CheckoutShippingZoneState,
      CheckoutShippingRate,
    ]),
    PlatformSettingsModule,
    AuditModule,
  ],
  controllers: [CheckoutShippingController, CheckoutShippingAdminController],
  providers: [
    CheckoutShippingService,
    CheckoutShippingAdminService,
    { provide: ZONE_RATE_PROVIDER, useClass: DatabaseZoneRateProvider },
  ],
  exports: [CheckoutShippingService],
})
export class CheckoutShippingModule {}