import { HttpException, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, type Socket } from 'socket.io';
import { Subscription } from 'rxjs';
import { corsOrigins } from '../../config/configuration';
import { AuthenticatedUser, JwtPayload } from '../../common/interfaces';
import { RoleName } from '../../common/enums';
import { OrderStatusBus } from './order-status.bus';
import { OrdersService } from './orders.service';

const ADMIN_ROOM = 'admin:live';
const ORDER_ROOM_PREFIX = 'order:';
const ADMIN_ROLES = new Set<RoleName>([
  RoleName.BUSINESS_OWNER_ADMIN,
  RoleName.MANAGEMENT,
  RoleName.SALES,
  RoleName.INVENTORY,
  RoleName.PRODUCTION,
  RoleName.FINANCE_ACCOUNTING,
]);

interface RealtimeSocket extends Socket {
  data: {
    user?: AuthenticatedUser;
  };
}

interface OrderSubscriptionRequest {
  orderId?: unknown;
  guestToken?: unknown;
}

interface OrderSubscriptionAck {
  ok: boolean;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

@WebSocketGateway({
  cors: {
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allowed?: boolean) => void,
    ) => {
      if (!origin || corsOrigins().includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin is not allowed'), false);
    },
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayConnection<RealtimeSocket>, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private server!: Server;

  private readonly subscriptions = new Subscription();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly orders: OrdersService,
    private readonly orderStatusBus: OrderStatusBus,
  ) {}

  onModuleInit(): void {
    this.subscriptions.add(
      this.orderStatusBus.events().subscribe(({ orderId, at }) => {
        this.server?.to(this.orderRoom(orderId)).emit('order:updated', { orderId, at });
        this.publishAdminDataChanged();
      }),
    );
  }

  onModuleDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  async handleConnection(client: RealtimeSocket): Promise<void> {
    const token = client.handshake.auth?.['token'];
    if (token === undefined || token === null || token === '') return;
    if (typeof token !== 'string') {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('jwt.secret'),
      });
      if (payload.type !== 'access' || !payload.sub || !Object.values(RoleName).includes(payload.role)) {
        client.disconnect(true);
        return;
      }

      const user: AuthenticatedUser = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };
      client.data.user = user;
      if (ADMIN_ROLES.has(user.role)) {
        await client.join(ADMIN_ROOM);
        client.emit('admin:data-changed', { at: new Date().toISOString() });
      }
    } catch {
      client.disconnect(true);
    }
  }

  publishAdminDataChanged(): void {
    this.server?.to(ADMIN_ROOM).emit('admin:data-changed', { at: new Date().toISOString() });
  }

  @SubscribeMessage('order:subscribe')
  async subscribeOrder(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() request: OrderSubscriptionRequest,
  ): Promise<OrderSubscriptionAck> {
    if (
      !isUuid(request?.orderId) ||
      (request.guestToken !== undefined && typeof request.guestToken !== 'string')
    ) {
      return { ok: false };
    }

    try {
      const guestToken =
        typeof request.guestToken === 'string' ? request.guestToken : undefined;
      await this.orders.tracking(request.orderId, client.data.user, guestToken);
      await client.join(this.orderRoom(request.orderId));
      return { ok: true };
    } catch (error) {
      if (!(error instanceof HttpException)) {
        this.logger.error(
          'Unexpected failure while authorizing an order live-update subscription',
          error instanceof Error ? error.stack : undefined,
        );
      }
      return { ok: false };
    }
  }

  private orderRoom(orderId: string): string {
    return `${ORDER_ROOM_PREFIX}${orderId}`;
  }
}
