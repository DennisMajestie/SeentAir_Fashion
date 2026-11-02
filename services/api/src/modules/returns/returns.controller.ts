import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
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
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.returnsService.findAll(user, pagination.page ?? 1, pagination.limit ?? 20);
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
