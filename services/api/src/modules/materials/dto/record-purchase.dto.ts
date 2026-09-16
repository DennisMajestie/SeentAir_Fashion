import { IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class RecordPurchaseDto {
  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cost: number;

  /** Free-text only — supplier management is descoped (appendix 13). */
  @IsOptional()
  @IsString()
  note?: string;

  /** Purchasing requires an approved request (appendix 19). */
  @IsUUID()
  approvalRequestId: string;
}
