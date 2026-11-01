import { IsEnum } from 'class-validator';
import { HelpTicketStatus } from '../help-ticket.entity';

export class UpdateHelpTicketStatusDto {
  @IsEnum(HelpTicketStatus)
  status: HelpTicketStatus;
}
