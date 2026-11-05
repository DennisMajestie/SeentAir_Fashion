import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { formatOrderNumber } from '../../../common/order-number';
import { CUSTOMER_AWAITING_STOCK } from '../customer-status';
import { OrderStatusEvent, PAYMENT_EXCEPTION_EVENT } from '../entities/order-status-event.entity';
import {
  DeliveryMethod,
  Order,
  OrderChannel,
  OrderShippingAddress,
  OrderStatus,
  PaymentStatus,
} from '../entities/order.entity';

export class OrderDetailItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  productName: string;

  @ApiProperty()
  sku: string;

  @ApiProperty({ nullable: true })
  size: string | null;

  @ApiProperty({ nullable: true })
  colour: string | null;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  unitPrice: number;

  @ApiProperty()
  lineTotal: number;

  @ApiPropertyOptional({ description: 'Staff-only stock shortfall' })
  shortfall?: number;
}

export class OrderDetailEventDto {
  @ApiProperty()
  status: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiPropertyOptional({ nullable: true, description: 'Staff-only event note' })
  note?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Staff-only actor user ID' })
  actorId?: string | null;

  @ApiPropertyOptional({ nullable: true, enum: ['staff', 'customer', 'system'] })
  actorKind?: 'staff' | 'customer' | 'system' | null;
}

export class OrderDetailDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'SO-1001', description: 'Human-readable order number' })
  orderNumber: string;

  @ApiProperty({ enum: OrderChannel })
  channel: OrderChannel;

  @ApiProperty({ enum: [...Object.values(OrderStatus), CUSTOMER_AWAITING_STOCK] })
  status: OrderStatus | typeof CUSTOMER_AWAITING_STOCK;

  @ApiProperty({ enum: PaymentStatus })
  paymentStatus: PaymentStatus;

  @ApiProperty()
  totalAmount: number;

  @ApiProperty({ nullable: true })
  deliveryFee: number | null;

  @ApiProperty({ enum: DeliveryMethod, nullable: true })
  deliveryMethod: DeliveryMethod | null;

  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  shippingAddress: OrderShippingAddress | null;

  @ApiProperty({ nullable: true })
  guestName: string | null;

  @ApiProperty({ nullable: true })
  guestEmail: string | null;

  @ApiProperty({ nullable: true })
  customerName: string | null;

  @ApiProperty({ nullable: true })
  customerEmail: string | null;

  @ApiProperty({ nullable: true })
  customerPhone: string | null;

  @ApiProperty({ nullable: true })
  customerNote: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Staff-only fulfilment note' })
  deliveryNote?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Staff-only gross weight' })
  grossWeightKg?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Staff-only pallet reference' })
  palletRef?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Staff-only QR stencil reference' })
  qrStencilRef?: string | null;

  @ApiProperty({ type: [OrderDetailItemDto] })
  items: OrderDetailItemDto[];

  @ApiProperty({ type: [OrderDetailEventDto] })
  events: OrderDetailEventDto[];

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deliveredAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

export type OrderDetailAudience = 'customer' | 'staff';

export function mapOrderDetail(
  order: Order,
  events: OrderStatusEvent[],
  audience: OrderDetailAudience,
): OrderDetailDto {
  const isStaff = audience === 'staff';
  const status =
    !isStaff && order.status === OrderStatus.STOCK_EXCEPTION
      ? CUSTOMER_AWAITING_STOCK
      : order.status;
  const visibleEvents = isStaff
    ? events
    : events.filter(
        (event) =>
          event.status !== OrderStatus.STOCK_EXCEPTION &&
          event.status !== PAYMENT_EXCEPTION_EVENT,
      );

  return {
    id: order.id,
    orderNumber: formatOrderNumber(order.orderNumber),
    channel: order.channel,
    status,
    paymentStatus: order.paymentStatus,
    totalAmount: order.totalAmount,
    deliveryFee: order.deliveryFee ?? null,
    deliveryMethod: order.deliveryMethod,
    shippingAddress: order.shippingAddress,
    guestName: order.guestName,
    guestEmail: order.guestEmail,
    customerName: order.customer?.name ?? null,
    customerEmail: order.customer?.email ?? null,
    customerPhone: order.customer?.phone ?? null,
    customerNote: order.customerNote,
    ...(isStaff
      ? {
          deliveryNote: order.deliveryNote,
          grossWeightKg: order.grossWeightKg,
          palletRef: order.palletRef,
          qrStencilRef: order.qrStencilRef,
        }
      : {}),
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.variant.product?.name ?? item.variant.sku,
      sku: item.variant.sku,
      size: item.variant.size,
      colour: item.variant.colour,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.unitPrice * item.quantity,
      ...(isStaff ? { shortfall: item.shortfall } : {}),
    })),
    events: visibleEvents.map((event) => ({
      status: event.status,
      createdAt: event.createdAt,
      ...(isStaff
        ? {
            note: event.note,
            actorId: event.actorId,
            actorKind: event.actorKind,
          }
        : {}),
    })),
    deliveredAt: order.deliveredAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}
