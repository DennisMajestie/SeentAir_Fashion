import { IsJWT, IsOptional } from 'class-validator';

/** Browsers send the refresh token via httpOnly cookie; the body field is a fallback for non-browser clients. */
export class RefreshDto {
  @IsOptional()
  @IsJWT()
  refreshToken?: string;
}
