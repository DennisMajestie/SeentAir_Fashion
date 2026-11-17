import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PayrollLineDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(100_000_000)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class CreatePayrollRunDto {
  /** The month being paid, 'YYYY-MM'. */
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'periodMonth must be YYYY-MM' })
  periodMonth: string;

  /** Paying staff is a fund movement; it needs an approved request. */
  @IsUUID()
  approvalRequestId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PayrollLineDto)
  lines: PayrollLineDto[];
}
