import { IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, IsUrl, IsUUID, Max, Min } from 'class-validator';

export class UpsertTechPackDto {
  @IsOptional()
  @IsString()
  silhouette?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  targetYieldUnits?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  cuttingEfficiencyPct?: number;

  /** Graded measurements keyed by size (chest/length/sleeve/hip per XS–XXL). */
  @IsOptional()
  @IsObject()
  gradedMeasurements?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  stitchProtocol?: string;

  @IsOptional()
  @IsString()
  laydownProtocol?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  dxfUrl?: string;
}

export class CreateTechPackDto extends UpsertTechPackDto {
  @IsUUID()
  @IsNotEmpty()
  variantId: string;
}