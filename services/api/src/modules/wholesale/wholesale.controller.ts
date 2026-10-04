import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { CreateTierDto } from './dto/create-tier.dto';
import { CreateWholesaleApplicationDto } from './dto/create-application.dto';
import { ReviewAccountDto } from './dto/review-account.dto';
import { UpdateTierDto } from './dto/update-tier.dto';
import { WholesaleService } from './wholesale.service';

@ApiTags('Wholesale')
@ApiBearerAuth()
@Controller('wholesale')
export class WholesaleController {
  constructor(private readonly wholesaleService: WholesaleService) {}

  /**
   * Public wholesale application (appendix 06).
   *
   * Unauthenticated on purpose: the wholesale portal's sign-in form doubles as
   * the application form, so a first-time buyer applies before having an
   * account. Throttled because it provisions a real customer account, and the
   * generic throttler would otherwise let one script create an unbounded number
   * of them.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('apply')
  async applyPublic(@Body() dto: CreateWholesaleApplicationDto) {
    try {
      return await this.wholesaleService.applyPublic(dto);
    } catch (e) {
      // create() throws ConflictException for a known email. Sending those
      // buyers to the catalogue flow is the useful next step, and the register
      // endpoint's message leaks whether an address is on file.
      if (e instanceof HttpException && e.getStatus() === 409) {
        throw new HttpException(
          'That email is already registered. Sign in above, then use "Apply for a wholesale account" in the catalogue.',
          409,
        );
      }
      throw e;
    }
  }

  /** Tier-priced catalogue for the caller's approved wholesale account. */
  @Get('pricing')
  pricing(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.wholesaleService.pricing(user, parseInt(page, 10), parseInt(limit, 10));
  }

  /**
   * Derived stock for the caller's approved wholesale account.
   *
   * Deliberately not a widening of the WHOLESALER role: this returns bare
   * quantities for the requested variant ids and nothing else. The ledger,
   * movement history and inventory summaries stay behind INVENTORY:VIEW,
   * which wholesalers do not hold.
   */
  @Get('stock')
  stock(
    @CurrentUser() user: AuthenticatedUser,
    @Query('variantIds') variantIds = '',
  ): Promise<Record<string, number | null>> {
    const ids = variantIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 200);
    return this.wholesaleService.stock(user, ids);
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

  /** Staff: all wholesale accounts/applications, optionally filtered by status. */
  @Get('accounts')
  @RequireAccess(ModuleName.WHOLESALE_ORDERS, AccessLevel.VIEW)
  findAccounts(@Query('status') status?: string) {
    return this.wholesaleService.findAllAccounts(
      status as import('./entities/wholesale-account.entity').WholesaleAccountStatus | undefined,
    );
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

  /** Deleting a tier is blocked while any wholesale account still uses it. */
  @Delete('tiers/:id')
  @RequireAccess(ModuleName.CATALOGUE, AccessLevel.FULL)
  removeTier(@Param('id', ParseUUIDPipe) id: string) {
    return this.wholesaleService.deleteTier(id);
  }
}
