import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { CreateTechPackDto, UpsertTechPackDto } from './dto/upsert-tech-pack.dto';
import { TechPacksService } from './tech-packs.service';

@ApiTags('Tech Packs')
@ApiBearerAuth()
@Controller('tech-packs')
export class TechPacksController {
  constructor(private readonly techPacksService: TechPacksService) {}

  @Get()
  @RequireAccess(ModuleName.CATALOGUE, AccessLevel.VIEW)
  findAll() {
    return this.techPacksService.findAll();
  }

  @Get(':id')
  @RequireAccess(ModuleName.CATALOGUE, AccessLevel.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.techPacksService.findOne(id);
  }

  @Post()
  @RequireAccess(ModuleName.CATALOGUE, AccessLevel.FULL)
  create(@Body() dto: CreateTechPackDto, @CurrentUser() user: AuthenticatedUser) {
    return this.techPacksService.create(dto, user.id);
  }

  @Put(':id')
  @RequireAccess(ModuleName.CATALOGUE, AccessLevel.FULL)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertTechPackDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.techPacksService.update(id, dto, user.id);
  }

  @Post(':id/approve')
  @RequireAccess(ModuleName.CATALOGUE, AccessLevel.APPROVE)
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.techPacksService.approve(id, user.id);
  }

  @Get(':id/revisions')
  @RequireAccess(ModuleName.CATALOGUE, AccessLevel.VIEW)
  revisions(@Param('id', ParseUUIDPipe) id: string) {
    return this.techPacksService.revisions(id);
  }
}