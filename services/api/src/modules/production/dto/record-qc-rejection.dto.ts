import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { QCDisposition } from '../entities/qc-rejection.entity';

export class RecordQCRejectionDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  /** Required — the reason drives the disposition (appendix 02). */
  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsEnum(QCDisposition)
  disposition: QCDisposition;
}
