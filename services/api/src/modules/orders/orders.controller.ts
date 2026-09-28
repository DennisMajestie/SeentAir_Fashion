import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  RawBodyRequest,
  Req,
  Sse,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../../common/interfaces';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderFulfilmentDto } from './dto/order-fulfilment.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderChannel, OrderStatus } from './entities/order.entity';
import { PaymentMethod } from './entities/payment.entity';
import { OrderStatusBus } from './order-status.bus';
import { OrdersService, PaystackWebhookEvent } from './orders.service';
import { PaystackService } from './paystack.service';

@ApiTags('Orders')
@Controller()
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly paystackService: PaystackService,
    private readonly orderStatusBus: OrderStatusBus,
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
   * Fulfilment staging: shipping address, gross weight, pallet reference and
   * QR stencil generation before dispatch (appendix 04 / appendix 05).
   */
  @Patch('orders/:id/fulfilment')
  @ApiBearerAuth()
  fulfilment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OrderFulfilmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.fulfilment(id, dto, user);
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
      return this.ordersService.initPaystackPayment(id, user, dto.email);
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
    // No query/body/header parameter is accepted here. The customer vs staff
    // shape is decided inside the service from the caller's own permissions, so
    // there is nothing for a client to send to influence it.
    return this.ordersService.tracking(id, user);
  }

  /**
   * Live push of this order's status changes. Emits a notification per change
   * (never the tracking payload) so the client re-fetches /tracking over
   * ordinary authenticated HTTP — one code path for the tracking shape, and an
   * expiring token degrades the stream without losing data.
   */
  @Sse('orders/:id/stream')
  @ApiBearerAuth()
  async stream(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Observable<MessageEvent>> {
    await this.ordersService.findById(id, user);
    return this.orderStatusBus.stream(id);
  }

  /** Stock exception (paid, short on stock): retry allocation now that stock has landed. */
  @Post('orders/:id/stock-exception/allocate')
  @ApiBearerAuth()
  allocateStock(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.allocateStockException(id, user);
  }

  /** Stock exception: release allocated units, record the refund, close the order. */
  @Post('orders/:id/stock-exception/refund')
  @ApiBearerAuth()
  refundStock(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.refundStockException(id, user);
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
    const event = JSON.parse(rawBody) as PaystackWebhookEvent;
    // Terminal conditions are recorded and acknowledged (200); only transient
    // errors surface as non-2xx so that Paystack retries.
    const { outcome } = await this.ordersService.handlePaystackEvent(event);
    return { received: true, outcome };
  }
}
