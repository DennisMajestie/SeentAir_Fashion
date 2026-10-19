import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { normalizeEmail, normalizePhone } from './coupon-code';
import { Order, PaymentStatus } from '../orders/entities/order.entity';

/**
 * Deciding whether somebody counts as a new customer.
 *
 * "New" means they have never paid before, judged three ways at once: no paid
 * order on this account, and no prior paid order matching the same email, and
 * none matching the same phone. Any one match means they are returning, and the
 * coupon is refused.
 *
 * The phone comparison is deliberately the NORMALISED form, so `0803...`,
 * `+234803...` and `234-803...` are the same subscriber. That also means it
 * matches a guest who ordered with a different phone but the same person behind
 * the number - which is the intent, and also why it is a weaker signal than a
 * verified email: shared and reassigned numbers exist. It errs towards
 * refusing a welcome coupon rather than towards handing one to a returning
 * customer.
 */
@Injectable()
export class NewCustomerService {
  constructor(
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
  ) {}

  /**
   * Whether this customer is new. `now` is not used for the comparison itself -
   * a paid order counts whatever its date - but is accepted so the caller can
   * keep one clock for the whole evaluation.
   */
  async isNewCustomer(
    userId: string,
    email: string | null,
    phone: string | null,
  ): Promise<boolean> {
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(phone);

    const paidOnAccount = await this.orders
      .createQueryBuilder('o')
      .where('o.customer_id = :userId', { userId })
      .andWhere('o.payment_status = :paid', { paid: PaymentStatus.PAID })
      .getExists();
    if (paidOnAccount) return false;

    if (normalizedEmail) {
      const byEmail = await this.orders
        .createQueryBuilder('o')
        .where('LOWER(TRIM(o.guest_email)) = :email', { email: normalizedEmail })
        .andWhere('o.payment_status = :paid', { paid: PaymentStatus.PAID })
        .getExists();
      if (byEmail) return false;
    }

    if (normalizedPhone) {
      // Compared on digits only, in SQL, so no row has to be loaded to check it.
      const byPhone = await this.orders
        .createQueryBuilder('o')
        .where(`regexp_replace(COALESCE(o.shipping_address->>'phone', ''), '\\D', '', 'g') = :phone`, {
          phone: normalizedPhone,
        })
        .andWhere('o.payment_status = :paid', { paid: PaymentStatus.PAID })
        .getExists();
      if (byPhone) return false;
    }

    return true;
  }
}
