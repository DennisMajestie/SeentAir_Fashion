import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName, RoleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UsersService } from './users.service';

@ApiTags('Users & Roles')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequireAccess(ModuleName.STAFF_ACCESS, AccessLevel.VIEW)
  findAll(@Query() pagination: PaginationQueryDto) {
    return this.usersService.findAll(pagination.page ?? 1, pagination.limit ?? 20);
  }

  /** Role × module permission dot-matrix (staff-access screen). */
  @Get('roles')
  @RequireAccess(ModuleName.STAFF_ACCESS, AccessLevel.VIEW)
  getPermissionMatrix() {
    return this.usersService.getPermissionMatrix();
  }

  /** Replace one role's whole permission set. */
  @Put('roles/:roleName/permissions')
  @RequireAccess(ModuleName.STAFF_ACCESS, AccessLevel.FULL)
  async updateRolePermissions(@Param('roleName') roleName: string, @Body() dto: UpdatePermissionsDto) {
    const updated = await this.usersService.updateRolePermissions(
      roleName as RoleName,
      dto.permissions,
      dto.baseVersion,
    );
    return dto.reason === undefined ? updated : { ...updated, reason: dto.reason };
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Post()
  @RequireAccess(ModuleName.STAFF_ACCESS, AccessLevel.FULL)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get(':id')
  @RequireAccess(ModuleName.STAFF_ACCESS, AccessLevel.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id/role')
  @RequireAccess(ModuleName.STAFF_ACCESS, AccessLevel.FULL)
  updateRole(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    return this.usersService.updateRole(id, dto.role);
  }

  @Patch(':id/deactivate')
  @RequireAccess(ModuleName.STAFF_ACCESS, AccessLevel.FULL)
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.deactivate(id);
  }

  @Patch(':id/activate')
  @RequireAccess(ModuleName.STAFF_ACCESS, AccessLevel.FULL)
  activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.activate(id);
  }
}
