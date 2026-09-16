import { IsEnum, IsNumber, Min } from 'class-validator';
import { PaymentMethod } from '../../orders/entities/payment.entity';

export class RecordCustomPaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  /** Must equal the quotation amount exactly — full payment before sample production. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;
}
