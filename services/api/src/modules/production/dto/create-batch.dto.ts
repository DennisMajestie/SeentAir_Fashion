import { IsDateString, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateBatchDto {
  /** The variant (SKU) this run produces — one batch per variant. */
  @IsUUID()
  variantId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsDateString()
  plannedDate?: string;

  /** Production starts require an approved request (appendix 19). */
  @IsUUID()
  approvalRequestId: string;
}
