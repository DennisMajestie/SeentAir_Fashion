import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Buyer of a staff-recorded in-store sale. No account, no email — the shopper
 * is documented by name and phone so the sale has a real person behind it.
 */
export class WalkInContactDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @Matches(/^[+\d][\d\s()-]{6,30}$/, { message: 'phone must be a valid phone number' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone: string;
}
