import 'reflect-metadata';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { HelpTicketStatus } from '../help-ticket.entity';

/** Whitelisted status filter for the admin help-ticket list. */
export class HelpTicketsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(HelpTicketStatus)
  status?: HelpTicketStatus;
}
