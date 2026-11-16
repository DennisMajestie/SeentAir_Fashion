import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(512)
  attachmentUrl?: string;
}
