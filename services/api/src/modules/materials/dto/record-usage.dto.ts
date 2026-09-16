import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class RecordUsageDto {
  @IsInt()
  @Min(1)
  quantityUsed: number;

  /** Production batch consuming the material (Phase 2 onward). */
  @IsOptional()
  @IsUUID()
  batchId?: string;
}
