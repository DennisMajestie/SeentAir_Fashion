import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Who is buying, when they have no account. Deliberately two fields: the point
 * of guest checkout is that a single-item purchase does not turn into a sign-up,
 * so anything not strictly needed to take money and deliver a parcel stays out.
 *
 * The email is not optional even though there is no account behind it — Paystack
 * requires one to initialise a transaction, it is where the receipt and the
 * tracking link go, and it is the key a later registration claims the order on.
 */
export class GuestContactDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  /** Normalised here so the claim in step 4 can match on equality, not a LOWER() scan. */
  @IsEmail()
  @MaxLength(320)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;
}
