import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

/** Master data only — stock is derived from the inventory ledger, never set here. */
export class UpdateMaterialDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  unit?: string;

  @IsOptional()
  @IsString()
  category?: string | null;

  @IsOptional()
  @IsString()
  storageLocation?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  reorderThreshold?: number;
}
