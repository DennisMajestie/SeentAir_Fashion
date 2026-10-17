import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { PlatformSetting } from './entities/platform-setting.entity';
import { PlatformSettingsService } from './platform-settings.service';

/**
 * One place that knows whether the delivery and tax features are switched on.
 * Other modules import the service rather than reading the row, so the env
 * kill-switch can never be bypassed by a module that forgot to check it.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PlatformSetting]), AuditModule],
  providers: [PlatformSettingsService],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}