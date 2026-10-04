import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { WholesaleBuyerType } from '../entities/wholesale-account.entity';

/**
 * Public wholesale application (appendix 06).
 *
 * Carries the credentials as well as the business details so a first-time
 * buyer can apply without a separate signup round-trip. `openingVolume` is
 * advisory only -- MOQ is enforced at order time by assertApprovedAccount, not
 * here, so a buyer who underestimates is not blocked from applying.
 */
export class CreateWholesaleApplicationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  businessName: string;

  @IsEnum(WholesaleBuyerType)
  buyerType: WholesaleBuyerType;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  businessPhone?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  city: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  state: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  openingVolume?: number;
}