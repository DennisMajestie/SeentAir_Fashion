import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class RecordTelemetryDto {
  @IsString()
  @IsNotEmpty()
  stage: string;

  @IsString()
  @IsNotEmpty()
  machine: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rpm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  needleCycles?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  threadReservePct?: number;

  @IsOptional()
  @IsString()
  operatorId?: string;
}