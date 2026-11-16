import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ConversationStatus } from '../conversation.entity';

export class UpdateConversationDto {
  @IsOptional()
  @IsEnum(ConversationStatus)
  status?: ConversationStatus;

  /** Setting to null clears the assignment; omitted leaves it untouched. */
  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;
}
