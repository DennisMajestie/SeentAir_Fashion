import { IsDefined, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** A routable Nigerian delivery destination. GIGL needs a state to route on,
    a city/LGA to sort into a zone, a street line to hand the parcel, and a
    phone the rider can actually reach. Kept as a real DTO rather than
    free-form jsonb so the storefront and the staff pack-out screen cannot
    disagree about the shape — which previously let a plain string through the
    UI and fail validation at runtime. */
export class ShippingAddressDto {
  // @IsDefined is redundant for rejection (@IsString already catches undefined)
  // but keeps the 400 legible: a missing field says "should not be null or
  // undefined" instead of an incidental "must be a string".
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  state: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  city: string;

  /** Street, building and house number. */
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  line: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  phone: string;

  /** Optional rider hint — "opposite the filling station". */
  @IsOptional()
  @IsString()
  landmark?: string;
}
