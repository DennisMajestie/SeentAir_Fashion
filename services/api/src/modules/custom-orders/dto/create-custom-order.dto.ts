import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** All intake fields are client-confirmed as required (appendix 07). */
export class CreateCustomOrderDto {
  @IsString()
  @IsNotEmpty()
  sizes: string;

  @IsString()
  @IsNotEmpty()
  colours: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsString()
  @IsNotEmpty()
  location: string;

  @IsString()
  @IsNotEmpty()
  fabricQuality: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsDateString()
  desiredDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  referenceImageUrl?: string;
}
