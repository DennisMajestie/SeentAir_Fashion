import { IsArray, IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class ResolveReturnDto {
  @IsIn(['resolved', 'rejected'])
  decision: 'resolved' | 'rejected';

  @IsString()
  @IsNotEmpty()
  resolution: string;

  /** Exactly one of restocked/damaged must be true when resolving. */
  @IsOptional()
  @IsBoolean()
  restocked?: boolean;

  @IsOptional()
  @IsBoolean()
  damaged?: boolean;

  @IsOptional()
  @IsString()
  trackingNumber?: string;

  /** Intake photos documenting the returned item. */
  @IsOptional()
  @IsArray()
  @IsUrl({ require_tld: false }, { each: true })
  photoUrls?: string[];

  /** Quarantine-bay tag assigned at intake (e.g. "Q-07"). */
  @IsOptional()
  @IsString()
  bayTag?: string;
}
