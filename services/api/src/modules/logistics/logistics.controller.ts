import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import { UpsertPricingDto } from './dto/upsert-pricing.dto';
import { LogisticsService } from './logistics.service';

@ApiTags('Logistics')
@ApiBearerAuth()
@Controller()
export class LogisticsController {
  constructor(private readonly logisticsService: LogisticsService) {}

  @Get('deliveries')
  @RequireAccess(ModuleName.LOGISTICS, AccessLevel.VIEW)
  findAll(@Query('page') page = '1', @Query('limit') limit = '50') {
    return this.logisticsService.findAll(parseInt(page, 10), parseInt(limit, 10));
  }

  @Post('deliveries')
  @RequireAccess(ModuleName.LOGISTICS, AccessLevel.FULL)
  create(@Body() dto: CreateDeliveryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.logisticsService.createDelivery(dto, user);
  }

  @Patch('deliveries/:id/status')
  @RequireAccess(ModuleName.LOGISTICS, AccessLevel.FULL)
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDeliveryStatusDto) {
    return this.logisticsService.updateStatus(id, dto);
  }

  /** Own-scoped for customers/wholesalers; full view for staff. */
  @Get('deliveries/:id/tracking')
  tracking(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.logisticsService.tracking(id, user);
  }

  @Get('logistics/quote')
  @RequireAccess(ModuleName.LOGISTICS, AccessLevel.VIEW)
  quote(@Query('weightKg') weightKg: string, @Query('zone') zone: string) {
    return this.logisticsService.quote(parseFloat(weightKg), zone);
  }

  @Get('logistics/pricing')
  @RequireAccess(ModuleName.LOGISTICS, AccessLevel.VIEW)
  listPricing() {
    return this.logisticsService.listPricing();
  }

  @Post('logistics/pricing')
  @RequireAccess(ModuleName.LOGISTICS, AccessLevel.FULL)
  upsertPricing(@Body() dto: UpsertPricingDto) {
    return this.logisticsService.upsertPricing(dto);
  }
}
