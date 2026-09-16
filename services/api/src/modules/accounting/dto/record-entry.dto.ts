import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { LedgerEntryType } from '../ledger-entry.entity';

/**
 * Manual ledger entries (expenses, payroll, taxes, investments). Sales and
 * material purchases are recorded automatically by their own flows.
 * Manual entries move funds → approval-gated (appendix 19).
 */
export class RecordEntryDto {
  @IsEnum(LedgerEntryType)
  type: LedgerEntryType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsUUID()
  approvalRequestId: string;
}
