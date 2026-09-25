import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { CreateUserDto } from './dto/create-user.dto';
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
  findAll(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.usersService.findAll(parseInt(page, 10), parseInt(limit, 10));
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
  updateRolePermissions(
    @Param('roleName') roleName: string,
    @Body() dto: UpdatePermissionsDto,
  ) {
    return this.usersService.updateRolePermissions(roleName as never, dto.permissions);
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
}
