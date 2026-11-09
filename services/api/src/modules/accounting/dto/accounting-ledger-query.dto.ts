import 'reflect-metadata';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { LedgerEntryType } from '../ledger-entry.entity';

/** Whitelisted ledger filters; from/to arrive as ISO date strings. */
export class AccountingLedgerQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(LedgerEntryType)
  type?: LedgerEntryType;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
