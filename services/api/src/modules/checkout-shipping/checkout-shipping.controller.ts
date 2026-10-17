import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RoleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { CheckoutShippingService } from './checkout-shipping.service';
import { QuoteRequestDto } from './dto/quote-request.dto';
import { NIGERIAN_STATES } from './nigerian-states';

/**
 * The shopper-facing half of delivery pricing.
 *
 * Every route lives under `checkout-shipping`, never `logistics`: logistics is
 * the internal dispatch-costing module and its routes must not be widened to
 * answer customer questions.
 *
 * The quote route is reachable by a signed-in customer OR a guest - there is no
 * account requirement at checkout - so access is decided inside the service
 * rather than by `@RequireAccess`, following the orders controller. It carries
 * no `@RequireAccess` decorator on purpose: the global access guard lets a
 * decorator-less route through for ANY authenticated user, which is correct
 * here because pricing a quote is not privileged, and wrong for anything that
 * changes a price.
 */
@Controller('checkout-shipping')
export class CheckoutShippingController {
  constructor(private readonly checkoutShipping: CheckoutShippingService) {}

  /** The state list for the storefront's dropdown. Public and harmless. */
  @Public()
  @Get('states')
  states(): { key: string; name: string }[] {
    return NIGERIAN_STATES.map((s) => ({ key: s.key, name: s.name }));
  }

  /**
   * Prices a delivery. Throttled because it is cheap to call but hits the rate
   * tables, and because an unauthenticated caller could otherwise use it to
   * enumerate which states are served.
   */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('quote')
  quote(
    @Body() dto: QuoteRequestDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ) {
    const actor: AuthenticatedUser | null =
      user && user.role !== RoleName.PARTNER_INVESTOR ? user : null;
    return this.checkoutShipping.quote(dto, actor, new Date());
  }
}