import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../../common/interfaces';
import { CreateOrderDto } from './dto/create-order.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderChannel, OrderStatus } from './entities/order.entity';
import { PaymentMethod } from './entities/payment.entity';
import { OrdersService } from './orders.service';
import { PaystackService } from './paystack.service';

@ApiTags('Orders')
@Controller()
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly paystackService: PaystackService,
  ) {}

  // Access rules for the shared /orders resource are enforced inside
  // OrdersService (they span retail_orders and wholesale_orders, so a
  // single @RequireAccess module cannot express them).

  @Post('orders')
  @ApiBearerAuth()
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.create(dto, user);
  }

  @Get('orders')
  @ApiBearerAuth()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('channel') channel?: OrderChannel,
    @Query('status') status?: OrderStatus,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.ordersService.findAll(user, {
      channel,
      status,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  }

  @Get('orders/:id')
  @ApiBearerAuth()
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.findById(id, user);
  }

  @Patch('orders/:id/status')
  @ApiBearerAuth()
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.updateStatus(id, dto.status, dto.note, user);
  }

  /**
   * Paystack → returns an authorization URL for the customer to pay.
   * Offline methods → staff record the full payment manually.
   */
  @Post('orders/:id/payment')
  @ApiBearerAuth()
  pay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (dto.method === PaymentMethod.PAYSTACK) {
      return this.ordersService.initPaystackPayment(id, user);
    }
    return this.ordersService.recordOfflinePayment(id, dto, user);
  }

  /** Reorder: same items, repriced at current prices/tier. */
  @Post('orders/:id/reorder')
  @ApiBearerAuth()
  reorder(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.reorder(id, user);
  }

  @Get('orders/:id/tracking')
  @ApiBearerAuth()
  tracking(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.tracking(id, user);
  }

  /** Paystack server-to-server webhook — authenticated by HMAC signature, not JWT. */
  @Public()
  @Post('payments/paystack/webhook')
  @HttpCode(200)
  async paystackWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string | undefined,
  ) {
    const rawBody = req.rawBody?.toString('utf8') ?? '';
    this.paystackService.verifyWebhookSignature(rawBody, signature);
    const event = JSON.parse(rawBody) as {
      event: string;
      data: { reference: string; amount: number };
    };
    if (event.event === 'charge.success') {
      await this.ordersService.confirmPaystackPayment(event.data.reference, event.data.amount);
    }
    return { received: true };
  }
}
