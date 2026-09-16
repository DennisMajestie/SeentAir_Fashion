import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class IssueQuotationDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  note?: string;
}
