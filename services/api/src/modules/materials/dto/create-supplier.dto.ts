import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  /** fabrics | trims_hardware | thread | packaging | printing | labels | other */
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsBoolean()
  certified?: boolean;

  /** 0–100 SLA score. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  slaScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  quotaUnits?: number;

  @IsOptional()
  @IsString()
  complianceNotes?: string;
}