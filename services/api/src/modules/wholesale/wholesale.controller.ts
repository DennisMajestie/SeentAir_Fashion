import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { CreateTierDto } from './dto/create-tier.dto';
import { ReviewAccountDto } from './dto/review-account.dto';
import { UpdateTierDto } from './dto/update-tier.dto';
import { WholesaleService } from './wholesale.service';

@ApiTags('Wholesale')
@ApiBearerAuth()
@Controller('wholesale')
export class WholesaleController {
  constructor(private readonly wholesaleService: WholesaleService) {}

  /** Tier-priced catalogue for the caller's approved wholesale account. */
  @Get('pricing')
  pricing(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.wholesaleService.pricing(user, parseInt(page, 10), parseInt(limit, 10));
  }

  /** Order & invoice/payment history for the caller's wholesale account. */
  @Get('invoices')
  invoices(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.wholesaleService.invoices(user, parseInt(page, 10), parseInt(limit, 10));
  }

  /** Any authenticated user can apply; staff review below. */
  @Post('accounts')
  apply(@CurrentUser() user: AuthenticatedUser) {
    return this.wholesaleService.apply(user);
  }

  @Get('accounts/:id')
  @RequireAccess(ModuleName.WHOLESALE_ORDERS, AccessLevel.VIEW)
  findAccount(@Param('id', ParseUUIDPipe) id: string) {
    return this.wholesaleService.findById(id);
  }

  /** Approve/reject and assign a tier (manual pending Open Question #2). */
  @Patch('accounts/:id')
  @RequireAccess(ModuleName.WHOLESALE_ORDERS, AccessLevel.FULL)
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewAccountDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.wholesaleService.review(id, dto, user);
  }

  @Get('tiers')
  @RequireAccess(ModuleName.WHOLESALE_ORDERS, AccessLevel.VIEW)
  findTiers() {
    return this.wholesaleService.findTiers();
  }

  @Post('tiers')
  @RequireAccess(ModuleName.CATALOGUE, AccessLevel.FULL)
  createTier(@Body() dto: CreateTierDto) {
    return this.wholesaleService.createTier(dto);
  }

  /** Discount changes are price changes — approval-gated in the service. */
  @Patch('tiers/:id')
  @RequireAccess(ModuleName.CATALOGUE, AccessLevel.FULL)
  updateTier(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTierDto) {
    return this.wholesaleService.updateTier(id, dto);
  }
}
