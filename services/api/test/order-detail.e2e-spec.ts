import { INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { RoleName } from '../src/common/enums';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { OrdersController } from '../src/modules/orders/orders.controller';
import { OrdersService } from '../src/modules/orders/orders.service';
import { OrderStatusBus } from '../src/modules/orders/order-status.bus';
import { PaystackService } from '../src/modules/orders/paystack.service';
import request from 'supertest';

const JWT_SECRET = 'order-detail-test-secret';
const ORDER_ID = '0b491dff-9704-4c33-9a7f-ae5d4ecb2bcf';

describe('GET /orders/:id/detail — signed role tokens', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const ordersService = {
    detail: jest.fn(async (id: string, user?: unknown, token?: string) => ({
      id,
      user,
      token,
    })),
  };

  beforeAll(async () => {
    jwt = new JwtService({ secret: JWT_SECRET });
    const moduleRef = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        { provide: OrdersService, useValue: ordersService },
        { provide: PaystackService, useValue: {} },
        { provide: OrderStatusBus, useValue: {} },
        Reflector,
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: new ConfigService({ jwt: { secret: JWT_SECRET } }) },
        {
          provide: APP_GUARD,
          useFactory: (
            reflector: Reflector,
            jwtService: JwtService,
            config: ConfigService,
          ) => new JwtAuthGuard(jwtService, reflector, config),
          inject: [Reflector, JwtService, ConfigService],
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => app?.close());
  beforeEach(() => ordersService.detail.mockClear());

  async function signedToken(role: RoleName): Promise<string> {
    return jwt.signAsync({
      sub: `user-${role}`,
      email: `${role}@example.test`,
      role,
      type: 'access',
    });
  }

  it.each(Object.values(RoleName))('forwards a signed %s role to the authorized detail service', async (role) => {
    const token = await signedToken(role);
    const response = await request(app.getHttpServer())
      .get(`/orders/${ORDER_ID}/detail`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.id).toBe(ORDER_ID);
    expect(response.body.user).toMatchObject({
      id: `user-${role}`,
      email: `${role}@example.test`,
      role,
    });
    expect(ordersService.detail).toHaveBeenCalledWith(
      ORDER_ID,
      expect.objectContaining({ role }),
      undefined,
    );
  });

  it('does not drop the authenticated user when a guest token is also supplied', async () => {
    const token = await signedToken(RoleName.CUSTOMER);
    await request(app.getHttpServer())
      .get(`/orders/${ORDER_ID}/detail?token=guest-token`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(ordersService.detail).toHaveBeenCalledWith(
      ORDER_ID,
      expect.objectContaining({ role: RoleName.CUSTOMER }),
      'guest-token',
    );
  });

  it('rejects invalid bearer tokens', async () => {
    await request(app.getHttpServer())
      .get(`/orders/${ORDER_ID}/detail`)
      .set('Authorization', 'Bearer invalid')
      .expect(401);
    expect(ordersService.detail).not.toHaveBeenCalled();
  });
});
