import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class RecordScanDto {
  /** Stage-gate event: cut_start, cut_done, sewing_start, finishing, qc, … */
  @IsString()
  @IsNotEmpty()
  eventType: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  scannedQty?: number;

  @IsOptional()
  @IsString()
  operatorId?: string;
}