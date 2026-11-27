import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ResetTwoFactorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason: string;
}
