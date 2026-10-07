import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** When provided it must be a known category; omit it to leave the value alone. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  category?: string;

  /** Changing price requires an approved PRICE_CHANGE request (server-side gate). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice?: number;

  @IsOptional()
  @IsUUID()
  collectionId?: string;

  @IsOptional()
  @IsUUID()
  approvalRequestId?: string;
}
