import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { PayrollService } from './payroll.service';

@ApiTags('Accounting')
@ApiBearerAuth()
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('runs')
  @RequireAccess(ModuleName.ACCOUNTING, AccessLevel.VIEW)
  list(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.payroll.list(Number(page) || 1, Math.min(Number(limit) || 20, 100));
  }

  @Get('runs/:id')
  @RequireAccess(ModuleName.ACCOUNTING, AccessLevel.VIEW)
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.detail(id);
  }

  /** Paying staff is a fund movement: gated on an approved request (appendix 19). */
  @Post('runs')
  @RequireAccess(ModuleName.ACCOUNTING, AccessLevel.FULL)
  create(@Body() dto: CreatePayrollRunDto, @CurrentUser() user: AuthenticatedUser) {
    return this.payroll.create(dto, user.id);
  }
}
