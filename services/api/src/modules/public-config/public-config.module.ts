import { Module } from '@nestjs/common';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { PublicConfigController } from './public-config.controller';

/**
 * Publishes the few values a signed-out frontend may read. The WhatsApp
 * assistance link rides along with the currency trio because both are
 * operator-owned configuration, not code.
 */
@Module({
  imports: [PlatformSettingsModule],
  controllers: [PublicConfigController],
})
export class PublicConfigModule {}
