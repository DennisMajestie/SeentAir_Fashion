import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateMaterialDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  unit: string;

  /** fabrics | trims_hardware | thread | packaging | printing | labels | other */
  @IsOptional()
  @IsString()
  category?: string;

  /** Warehouse location, e.g. "C3-R1". */
  @IsOptional()
  @IsString()
  storageLocation?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  reorderThreshold?: number;
}
