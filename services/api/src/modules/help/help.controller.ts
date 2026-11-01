import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CreateHelpTicketDto } from './dto/create-help-ticket.dto';
import { UpdateHelpTicketStatusDto } from './dto/update-help-ticket-status.dto';
import { HelpService } from './help.service';

@ApiTags('Help')
@ApiBearerAuth()
@Controller('help')
export class HelpController {
  constructor(private readonly help: HelpService) {}

  @Get('articles')
  @RequireAccess(ModuleName.COMMUNICATION, AccessLevel.VIEW)
  articles() {
    return this.help.articles();
  }

  @Get('tickets')
  @RequireAccess(ModuleName.COMMUNICATION, AccessLevel.VIEW)
  async tickets(@Query() pagination: PaginationQueryDto) {
    const [data, total] = await this.help.listTickets(
      pagination.page ?? 1,
      pagination.limit ?? 50,
    );
    return { data, total };
  }

  @Post('tickets')
  @RequireAccess(ModuleName.COMMUNICATION, AccessLevel.FULL)
  createTicket(@Body() dto: CreateHelpTicketDto, @CurrentUser() user: AuthenticatedUser) {
    return this.help.createTicket(dto, user.id);
  }

  @Patch('tickets/:id/status')
  @RequireAccess(ModuleName.COMMUNICATION, AccessLevel.FULL)
  updateTicketStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHelpTicketStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.help.updateTicketStatus(id, dto.status, user.id);
  }
}
