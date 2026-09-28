import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { CreateOrderDto } from './create-order.dto';
import { OrderFulfilmentDto } from './order-fulfilment.dto';

const VARIANT = '9d2c7a5e-1b3f-4a6d-8e0c-5f7a9b1d3e5f';
const ADDRESS = {
  state: 'Lagos',
  city: 'Yaba',
  line: '14 Herbert Macaulay Way',
  phone: '+234 801 234 5678',
};

const flatten = (errors: ValidationError[]): string[] =>
  errors.flatMap((e) => [...Object.values(e.constraints ?? {}), ...flatten(e.children ?? [])]);

const errorsFor = async (cls: new () => object, payload: unknown): Promise<string[]> =>
  flatten(await validate(plainToInstance(cls, payload)));

/** The address contract. A free-form `Record<string, unknown>` let the staff
    pack-out screen send a plain string, which only surfaced as a 400 at
    runtime. These lock the shape down on both write paths. */
describe('Shipping address contract', () => {
  it('accepts a full address at order creation', async () => {
    const errors = await errorsFor(CreateOrderDto, {
      items: [{ variantId: VARIANT, quantity: 1 }],
      shippingAddress: ADDRESS,
    });
    expect(errors).toEqual([]);
  });

  it('keeps the landmark optional', async () => {
    const errors = await errorsFor(CreateOrderDto, {
      items: [{ variantId: VARIANT, quantity: 1 }],
      shippingAddress: { ...ADDRESS, landmark: 'Opposite Mobil' },
    });
    expect(errors).toEqual([]);
  });

  it('rejects a bare string — the bug the pack-out screen used to send', async () => {
    const errors = await errorsFor(CreateOrderDto, {
      items: [{ variantId: VARIANT, quantity: 1 }],
      shippingAddress: '14 Herbert Macaulay Way, Yaba, Lagos',
    });
    expect(errors.join(' ')).toContain('shippingAddress');
  });

  it.each(['state', 'city', 'line', 'phone'])(
    'rejects a partial address missing %s',
    async (key) => {
      const partial: Record<string, unknown> = { ...ADDRESS };
      delete partial[key];
      const errors = await errorsFor(CreateOrderDto, {
        items: [{ variantId: VARIANT, quantity: 1 }],
        shippingAddress: partial,
      });
      expect(errors.length).toBeGreaterThan(0);
    },
  );

  it('treats the address as optional so in-store orders still save', async () => {
    const errors = await errorsFor(CreateOrderDto, {
      items: [{ variantId: VARIANT, quantity: 1 }],
    });
    expect(errors).toEqual([]);
  });

  it('accepts a full address override at pack-out', async () => {
    const errors = await errorsFor(OrderFulfilmentDto, { shippingAddress: ADDRESS });
    expect(errors).toEqual([]);
  });

  it('rejects a bare string at pack-out', async () => {
    const errors = await errorsFor(OrderFulfilmentDto, { shippingAddress: 'Yaba, Lagos' });
    expect(errors.join(' ')).toContain('shippingAddress');
  });

  it('carries the waybill note separately from the address', async () => {
    const errors = await errorsFor(OrderFulfilmentDto, {
      deliveryNote: 'Gate code 4412, call on arrival',
    });
    expect(errors).toEqual([]);
  });
});
