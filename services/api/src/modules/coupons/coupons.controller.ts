import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces';
import { CouponsService, PreviewRequest } from './coupons.service';

/**
 * The shopper-facing coupon routes.
 *
 * None of these carry `@RequireAccess`, and that is deliberate for two
 * different reasons. Claiming requires a signed-in shopper (a wallet row has a
 * non-null customer), so the global JWT guard plus the service's own customer
 * checks are the right protection. And because the global access guard lets a
 * decorator-less route through for ANY authenticated user, nothing here may be
 * used to change a price - these routes only ever read or add to a wallet.
 *
 * The clock is taken from the server on every call. A client cannot claim early
 * or claim late by sending a different "now", because it never sends one.
 */
@Controller('coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get('mine')
  wallet(@CurrentUser() user: AuthenticatedUser) {
    return this.coupons.walletFor(user.id, new Date());
  }

  /** Tight limit: a code endpoint is the one worth brute-forcing. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('claim')
  claim(@Body() body: { code: string }, @CurrentUser() user: AuthenticatedUser) {
    return this.coupons.claimByCode(body.code, user, new Date());
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('bundles/:id/claim')
  claimBundle(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.coupons.claimBundle(id, user, new Date());
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('campaigns/:id/claim')
  claimCampaign(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.coupons.claimCampaign(id, user, new Date());
  }

  /**
   * Read-only. Reserves nothing and mutates nothing, so it is safe to call on
   * every cart change; it is throttled anyway because it reads the rate tables.
   */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('preview')
  preview(
    @Body() body: PreviewRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Body('isNewCustomer') _ignored: never,
  ) {
    // New-customer status is decided server-side from the account, never taken
    // from the request, so a client cannot claim to be new by saying so.
    return this.coupons.preview(body, user, new Date(), false);
  }
}
