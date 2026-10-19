import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AccessLevel, ModuleName } from '../../common/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AuthenticatedUser } from '../../common/interfaces';
import { CheckoutShippingAdminService } from './checkout-shipping-admin.service';
import { CreateRateDto, CreateZoneDto, RemoveZoneDto, UpdateZoneDto } from './dto/checkout-shipping-admin.dto';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { UpdatePlatformSettingsDto } from '../platform-settings/dto/update-platform-settings.dto';

/**
 * Everything that can change what a customer pays to be delivered.
 *
 * Gated at `@RequireAccess(ModuleName.LOGISTICS, AccessLevel.FULL)` - the
 * highest level, on every method, not just the destructive ones. That is
 * deliberate: the global access guard lets a route through for ANY
 * authenticated user when it carries no `@RequireAccess`, so a pricing write
 * left undecorated would be reachable by a customer account. Every handler here
 * records the change in the shared audit log with a required reason.
 */
@Controller('checkout-shipping/admin')
@RequireAccess(ModuleName.LOGISTICS, AccessLevel.FULL)
export class CheckoutShippingAdminController {
  constructor(
    private readonly admin: CheckoutShippingAdminService,
    private readonly settings: PlatformSettingsService,
  ) {}

  @Get('settings')
  async getSettings() {
    return this.settings.get();
  }

  @Patch('settings')
  async updateSettings(
    @Body() dto: UpdatePlatformSettingsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.settings.update(dto, actor);
  }

  @Get('zones')
  listZones() {
    return this.admin.listZones();
  }

  @Post('zones')
  createZone(@Body() dto: CreateZoneDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.admin.createZone(dto, actor, dto.reason);
  }

  @Patch('zones/:id')
  updateZone(
    @Param('id') id: string,
    @Body() dto: UpdateZoneDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.admin.updateZone(id, dto, actor, dto.reason);
  }

  @Delete('zones/:id')
  removeZone(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser, @Body() dto: RemoveZoneDto) {
    return this.admin.removeZone(id, actor, dto.reason);
  }

  @Get('rates')
  listRates(@Query('zoneId') zoneId?: string) {
    return this.admin.listRates(zoneId);
  }

  @Post('rates')
  createRate(@Body() dto: CreateRateDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.admin.createRate(
      {
        zoneId: dto.zoneId,
        sizeClass: dto.sizeClass,
        method: dto.method,
        fee: dto.fee,
        // The DTO carries ISO strings; the service wants instants.
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        validTo: dto.validTo ? new Date(dto.validTo) : null,
        isActive: dto.isActive,
      },
      actor,
      dto.reason,
    );
  }
}