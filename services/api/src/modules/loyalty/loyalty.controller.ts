import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { LoyaltyService } from './loyalty.service';

@ApiTags('Loyalty')
@ApiBearerAuth()
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  /** A shopper sees their own balance and the last 20 movements. */
  @Get('mine')
  wallet(@CurrentUser() user: AuthenticatedUser) {
    return this.loyalty.wallet(user.id);
  }

  @Get('accounts')
  @RequireAccess(ModuleName.MARKETING, AccessLevel.VIEW)
  accounts() {
    return this.loyalty.accounts();
  }

  @Post('adjust')
  @RequireAccess(ModuleName.MARKETING, AccessLevel.FULL)
  adjust(@Body() body: { customerId: string; points: number; note: string }) {
    return this.loyalty.adjust(body.customerId, body.points, body.note);
  }
}
