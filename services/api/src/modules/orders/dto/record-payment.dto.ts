import { IsEmail, IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { PaymentMethod } from '../entities/payment.entity';

export class RecordPaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  /** Must equal the order total exactly — no part-payments (appendix 08). */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  /**
   * Paystack only — where the charge receipt and payment notification go.
   * Defaults to the order customer's own address. Overridable so local and
   * CI runs can pay with a real inbox: seeded accounts live on the reserved
   * `.test` TLD, which Paystack's email validator rejects. Ignored outside
   * non-production (see PAYSTACK_EMAIL_OVERRIDE_ALLOWED in configuration).
   */
  @IsOptional()
  @IsEmail()
  email?: string;
}
