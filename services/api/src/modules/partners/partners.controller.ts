import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { CreateDistributionDto } from './dto/create-distribution.dto';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { PartnersService } from './partners.service';

@ApiTags('Partners & Investors')
@ApiBearerAuth()
@Controller()
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Post('partners')
  @RequireAccess(ModuleName.PARTNERS, AccessLevel.FULL)
  create(@Body() dto: CreatePartnerDto, @CurrentUser() user: AuthenticatedUser) {
    return this.partnersService.create(dto, user);
  }

  @Get('partners')
  @RequireAccess(ModuleName.PARTNERS, AccessLevel.VIEW)
  findAll() {
    return this.partnersService.findAll();
  }

  /** Portal entry point: the signed-in partner's own dashboard. */
  @Get('partners/me/dashboard')
  async myDashboard(@CurrentUser() user: AuthenticatedUser) {
    const partner = await this.partnersService.findByUserId(user.id);
    return this.partnersService.dashboard(partner.id, user);
  }

  /** Read-mostly partner dashboard (own record, or staff with view access). */
  @Get('partners/:id/dashboard')
  dashboard(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.partnersService.dashboard(id, user);
  }

  @Get('partners/:id/profit-distributions')
  distributions(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.partnersService.distributions(id, user);
  }

  /** Quarterly distribution — fund movement, approval-gated in the service. */
  @Post('profit-distributions')
  @RequireAccess(ModuleName.PARTNERS, AccessLevel.FULL)
  createDistribution(@Body() dto: CreateDistributionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.partnersService.createDistribution(dto, user);
  }
}
