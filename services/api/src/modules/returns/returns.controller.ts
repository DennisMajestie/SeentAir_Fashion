import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { CreateReturnDto } from './dto/create-return.dto';
import { ResolveReturnDto } from './dto/resolve-return.dto';
import { ReturnsService } from './returns.service';

@ApiTags('Returns')
@ApiBearerAuth()
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  /** Customer raises a return (ownership + 12h window enforced in service). */
  @Post()
  create(@Body() dto: CreateReturnDto, @CurrentUser() user: AuthenticatedUser) {
    return this.returnsService.create(dto, user);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.returnsService.findAll(user, parseInt(page, 10), parseInt(limit, 10));
  }

  @Patch(':id/resolve')
  @RequireAccess(ModuleName.RETURNS, AccessLevel.FULL)
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveReturnDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.returnsService.resolve(id, dto, user);
  }
}
