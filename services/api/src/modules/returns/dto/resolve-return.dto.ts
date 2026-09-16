import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
}
