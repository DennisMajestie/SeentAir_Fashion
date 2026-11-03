import {
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateBusinessProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  taxId?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  fiscalStart?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  factoryName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  factoryCity?: string;

  @IsOptional()
  @IsString()
  factoryAddress?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  factoryCapacity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  factoryHours?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiryWarnDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  lowStockMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  defaultLocationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  weekStart?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  revenueGoal?: number;
}
