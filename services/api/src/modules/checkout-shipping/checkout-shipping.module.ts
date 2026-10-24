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
import { CheckoutShippingQuote } from './entities/checkout-shipping-quote.entity';
import { OrderCheckoutShipping } from './entities/order-checkout-shipping.entity';
import { QuoteVerificationService } from './quote-verification.service';
import { DatabaseZoneRateProvider } from './zone-rate.provider';
import {
  BASKET_SIZE_CLASS_RESOLVER,
  ProductCatalogueSizeClassResolver,
} from './basket-size-class-resolver';
import { ProductVariant } from '../catalogue/entities/product-variant.entity';

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
      CheckoutShippingQuote,
      OrderCheckoutShipping,
      ProductVariant,
    ]),
    PlatformSettingsModule,
    AuditModule,
  ],
  controllers: [CheckoutShippingController, CheckoutShippingAdminController],
  providers: [
    CheckoutShippingService,
    CheckoutShippingAdminService,
    QuoteVerificationService,
    { provide: ZONE_RATE_PROVIDER, useClass: DatabaseZoneRateProvider },
    { provide: BASKET_SIZE_CLASS_RESOLVER, useClass: ProductCatalogueSizeClassResolver },
  ],
  exports: [CheckoutShippingService, QuoteVerificationService, TypeOrmModule],
})
export class CheckoutShippingModule {}