import { IsEnum, IsNumber, Min } from 'class-validator';
import { PaymentMethod } from '../entities/payment.entity';

export class RecordPaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  /** Must equal the order total exactly — no part-payments (appendix 08). */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;
}
