import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ConversationChannel } from '../conversation.entity';

export class CreateConversationDto {
  @IsOptional()
  @IsEnum(ConversationChannel)
  channel?: ConversationChannel;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  subject?: string;

  /** First customer message — a conversation is never created empty. */
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body: string;

  @IsOptional()
  @IsUUID()
  relatedOrderId?: string;
}

export class CreateGuestConversationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body: string;
}

export class ConversationsQueryDto {
  @Type(() => Number)
  page?: number = 1;

  @Type(() => Number)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  status?: 'open' | 'pending' | 'closed';

  @IsOptional()
  @Type(() => Boolean)
  unreadOnly?: boolean;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}
