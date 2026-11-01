import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateHelpTicketDto {
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  subject: string;

  @IsString()
  @MinLength(5)
  @MaxLength(10_000)
  description: string;
}
