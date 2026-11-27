import { IsJWT, IsNotEmpty, IsNumberString, IsString, Length, MaxLength } from 'class-validator';

export class Verify2faDto {
  @IsJWT()
  challengeToken: string;

  @IsNumberString()
  @Length(6, 6)
  code: string;
}

export class RecoveryCodeDto {
  @IsJWT()
  challengeToken: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code: string;
}

export class TotpCodeDto {
  @IsNumberString()
  @Length(6, 6)
  code: string;
}
