import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { CustomOrdersService } from './custom-orders.service';
import { CreateCustomOrderDto } from './dto/create-custom-order.dto';
import { IssueQuotationDto } from './dto/issue-quotation.dto';
import { RecordCustomPaymentDto } from './dto/record-custom-payment.dto';
import { UpdateCustomStatusDto } from './dto/update-custom-status.dto';

class DecideSampleDto {
  @IsBoolean()
  approved: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}

@ApiTags('Custom Orders')
@ApiBearerAuth()
@Controller('custom-orders')
export class CustomOrdersController {
  constructor(private readonly customOrdersService: CustomOrdersService) {}

  /** Buyers (customers/wholesalers) submit design requests. */
  @Post()
  create(@Body() dto: CreateCustomOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.customOrdersService.create(dto, user);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.customOrdersService.findAll(user, parseInt(page, 10), parseInt(limit, 10));
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.customOrdersService.findById(id, user);
  }

  @Get(':id/quotation')
  async quotation(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.customOrdersService.findById(id, user); // ownership/access check
    return this.customOrdersService.getQuotation(id);
  }

  /** Design approval authority: Manager (APPROVE on custom orders). */
  @Post(':id/quotation')
  @RequireAccess(ModuleName.CUSTOM_ORDERS, AccessLevel.APPROVE)
  issueQuotation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IssueQuotationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customOrdersService.issueQuotation(id, dto, user);
  }

  @Post(':id/accept-quote')
  acceptQuote(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.customOrdersService.acceptQuote(id, user);
  }

  /** Full payment of the quoted amount (staff with payments access). */
  @Post(':id/payment')
  recordPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordCustomPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customOrdersService.recordPayment(id, dto, user);
  }

  /** The buyer's sample decision — the gate before full production. */
  @Post(':id/sample-approval')
  decideSample(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideSampleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customOrdersService.decideSample(id, dto.approved, dto.note, user);
  }

  /** Staff move the request through review/production/fulfilment. */
  @Patch(':id/status')
  @RequireAccess(ModuleName.CUSTOM_ORDERS, AccessLevel.FULL)
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomStatusDto) {
    return this.customOrdersService.updateStatus(id, dto.status, dto.note);
  }
}
