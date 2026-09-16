import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AccessGuard } from './common/guards/access.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AuditModule } from './modules/audit/audit.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { CatalogueModule } from './modules/catalogue/catalogue.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { ProductionModule } from './modules/production/production.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { WholesaleModule } from './modules/wholesale/wholesale.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { LogisticsModule } from './modules/logistics/logistics.module';
import { MarketingModule } from './modules/marketing/marketing.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { CustomOrdersModule } from './modules/custom-orders/custom-orders.module';
import { PartnersModule } from './modules/partners/partners.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    // Global rate limit; credential endpoints carry stricter @Throttle overrides.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.user'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.name'),
        autoLoadEntities: true,
        // Schema changes go through migrations only — never synchronize.
        synchronize: false,
      }),
    }),
    AuthModule,
    UsersModule,
    AuditModule,
    ApprovalsModule,
    CatalogueModule,
    InventoryModule,
    MaterialsModule,
    ProductionModule,
    OrdersModule,
    ReviewsModule,
    WholesaleModule,
    ReturnsModule,
    AccountingModule,
    LogisticsModule,
    MarketingModule,
    AnalyticsModule,
    NotificationsModule,
    CustomOrdersModule,
    PartnersModule,
  ],
  providers: [
    // Order matters: rate-limit, then authenticate, then authorize, then audit.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
