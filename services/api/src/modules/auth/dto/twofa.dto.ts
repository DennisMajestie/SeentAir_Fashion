import { IsJWT, IsNumberString, Length } from 'class-validator';

export class Verify2faDto {
  @IsJWT()
  challengeToken: string;

  @IsNumberString()
  @Length(6, 6)
  code: string;
}

export class TotpCodeDto {
  @IsNumberString()
  @Length(6, 6)
  code: string;
}
