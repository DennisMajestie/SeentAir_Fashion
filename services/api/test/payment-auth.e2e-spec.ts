import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { OrdersController } from '../src/modules/orders/orders.controller';
import { OrdersService } from '../src/modules/orders/orders.service';
import { PaystackService } from '../src/modules/orders/paystack.service';
import { OrderStatusBus } from '../src/modules/orders/order-status.bus';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { APP_GUARD, Reflector } from '@nestjs/core';

/**
 * Exercises the HTTP layer with the real guard, which is where the 401 came
 * from. The service is mocked: this is about whether the request reaches it.
 */
describe('POST /orders/:id/payment — auth at the HTTP layer', () => {
  let app: INestApplication;
  const ordersService = {
    initPaystackPayment: jest.fn(async () => ({ authorizationUrl: 'https://p/x', reference: 'r' })),
    recordOfflinePayment: jest.fn(async () => ({ id: 'p1' })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        { provide: OrdersService, useValue: ordersService },
        { provide: PaystackService, useValue: {} },
        { provide: OrderStatusBus, useValue: {} },
        Reflector,
        // The real guard, with real config — this is the layer that 401'd.
        {
          provide: APP_GUARD,
          useFactory: (reflector: Reflector) =>
            new JwtAuthGuard({ verify: () => ({ sub: 'u1' }) } as never, reflector, {
              get: () => 'secret',
            } as never),
          inject: [Reflector],
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  afterAll(async () => app?.close());

  const ORDER = '0b491dff-9704-4c33-9a7f-ae5d4ecb2bcf';

  it('the exact request that returned 401 in production now reaches the service', async () => {
    const res = await request(app.getHttpServer())
      .post(`/orders/${ORDER}/payment?token=abc`)
      .send({ method: 'paystack', amount: 24000 });
    expect(res.status).not.toBe(401);
    expect(ordersService.initPaystackPayment).toHaveBeenCalledWith(
      ORDER,
      undefined,
      undefined,
      'abc',
    );
  });

  it('an offline payment with no session is still rejected', async () => {
    const res = await request(app.getHttpServer())
      .post(`/orders/${ORDER}/payment?token=abc`)
      .send({ method: 'cash', amount: 24000 });
    expect(res.status).toBe(401);
    expect(ordersService.recordOfflinePayment).not.toHaveBeenCalled();
  });
});
