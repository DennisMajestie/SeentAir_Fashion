import { IsEmail, IsHexadecimal, IsString, Length, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsHexadecimal()
  @Length(64, 64)
  token: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}
