import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DeliveryMethod } from '../../orders/entities/order.entity';
import { QuoteRequestDto } from './quote-request.dto';

describe('QuoteRequestDto', () => {
  it('accepts storefront quote lines without a size-class hint', async () => {
    const dto = plainToInstance(QuoteRequestDto, {
      state: 'Lagos',
      lines: [
        {
          variantId: '00000000-0000-4000-8000-000000000001',
          quantity: 2,
          unitPrice: 9000,
        },
      ],
      method: DeliveryMethod.FREIGHT,
      subtotal: 18000,
    });

    expect(await validate(dto)).toEqual([]);
  });
});
