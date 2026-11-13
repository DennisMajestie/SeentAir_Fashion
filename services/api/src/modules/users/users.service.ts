import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { ACCESS_RANK, AccessLevel, ModuleName, RoleName, UserStatus } from '../../common/enums';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PermissionEntryDto } from './dto/update-permissions.dto';
import { Permission } from './entities/permission.entity';
import { RefreshToken } from '../auth/refresh-token.entity';
import { Role } from './entities/role.entity';
import { User } from './entities/user.entity';

const EXTERNAL_ROLES = new Set([RoleName.CUSTOMER, RoleName.WHOLESALER, RoleName.PARTNER_INVESTOR]);
const PERMISSION_WRITE_LOCK = 0x5345454e;

export interface RolePermissionMatrixRow {
  id: string;
  name: RoleName;
  permissions: Array<{ id?: string; module: ModuleName; accessLevel: AccessLevel }>;
  accessLevels: AccessLevel[];
  version: string;
  memberCount: number;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(Permission) private readonly permissionRepo: Repository<Permission>,
    @InjectRepository(RefreshToken) private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(page = 1, limit = 20): Promise<{ data: User[]; total: number }> {
    const [data, total] = await this.userRepo.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { data, total };
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  /** Staff lookup by role, for internal alerts. */
  async findByRoles(roles: RoleName[]): Promise<User[]> {
    return this.userRepo.find({ where: { role: { name: In(roles) } } });
  }

  /** Lookup by address, without the password hash. */
  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email: email.trim().toLowerCase() } });
  }

  /** For auth only — includes the password hash. */
  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .leftJoinAndSelect('user.role', 'role')
      .where('user.email = :email', { email })
      .getOne();
  }

  /** For 2FA verification only — includes the TOTP secret. */
  async findByIdWithTotpSecret(id: string): Promise<User | null> {
    return this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.totpSecret')
      .leftJoinAndSelect('user.role', 'role')
      .where('user.id = :id', { id })
      .getOne();
  }

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException(`Email ${dto.email} is already registered`);

    const role = await this.getRole(dto.role);
    const user = this.userRepo.create({
      name: dto.name,
      email: dto.email,
      phone: dto.phone ?? null,
      passwordHash: await bcrypt.hash(dto.password, 10),
      role,
    });
    const saved = await this.userRepo.save(user);
    return this.findById(saved.id); // re-fetch without password hash
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.findById(id);

    if (dto.name !== undefined) user.name = dto.name.trim();
    if (dto.phone !== undefined) user.phone = dto.phone.trim() || null;
    if (dto.title !== undefined) user.title = dto.title.trim() || null;

    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      if (email !== user.email) {
        const existing = await this.userRepo.findOne({ where: { email } });
        if (existing) throw new ConflictException(`Email ${email} is already registered`);
        user.email = email;
        user.emailVerifiedAt = null;
      }
    }

    await this.userRepo.save(user);
    return this.findById(id);
  }

  async updateRole(id: string, roleName: RoleName): Promise<User> {
    const user = await this.findById(id);
    user.role = await this.getRole(roleName);
    await this.userRepo.save(user);
    return this.findById(id);
  }

  /** Deactivate a staff member: sets status to DISABLED and revokes all sessions. */
  async deactivate(id: string): Promise<User> {
    const user = await this.findById(id);
    user.status = UserStatus.DISABLED;
    await this.userRepo.save(user);

    // Revoke all active refresh tokens so the user is logged out everywhere
    await this.refreshTokenRepo.update({ userId: id, revokedAt: IsNull() }, { revokedAt: new Date() });

    return this.findById(id);
  }

  /** Reactivate a disabled staff member: restores access without changing their role. */
  async activate(id: string): Promise<User> {
    const user = await this.findById(id);
    user.status = UserStatus.ACTIVE;
    await this.userRepo.save(user);
    return this.findById(id);
  }

  /** Full role × module permission dot-matrix for the staff-access screen. */
  async getPermissionMatrix(): Promise<RolePermissionMatrixRow[]> {
    const [roles, memberCounts] = await Promise.all([
      this.roleRepo.find({ relations: { permissions: true }, order: { name: 'ASC' } }),
      this.activeUserCounts(this.dataSource.manager),
    ]);
    return roles.map((role) => this.matrixRow(role, memberCounts.get(role.id) ?? 0));
  }

  /**
   * Replace a complete role permission set under a transaction. Role writes
   * serialize on a transaction-scoped advisory lock so the last full-access
   * staff-access holder cannot be removed by concurrent updates.
   */
  async updateRolePermissions(
    roleName: RoleName,
    permissions: PermissionEntryDto[],
    baseVersion?: string,
  ): Promise<RolePermissionMatrixRow> {
    if (roleName === RoleName.BUSINESS_OWNER_ADMIN) {
      throw new ConflictException('Business owner permissions are system-managed and cannot be changed');
    }
    if (EXTERNAL_ROLES.has(roleName)) {
      throw new ForbiddenException('External role permissions cannot be changed from staff settings');
    }
    this.assertCompletePermissionSet(permissions);

    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [PERMISSION_WRITE_LOCK]);

      const [roles, memberCounts] = await Promise.all([
        manager.getRepository(Role).find({ relations: { permissions: true }, order: { name: 'ASC' } }),
        this.activeUserCounts(manager),
      ]);
      const role = roles.find((item) => item.name === roleName);
      if (!role) throw new NotFoundException(`Role ${roleName} not seeded`);

      const currentVersion = this.permissionVersion(role.permissions ?? []);
      if (baseVersion !== undefined && baseVersion !== currentVersion) {
        throw new ConflictException({
          message: `Role '${roleName}' permissions changed since they were loaded`,
          permissions: this.canonicalPermissions(role.permissions ?? []),
          version: currentVersion,
        });
      }

      const staffAccess = permissions.find((permission) => permission.module === ModuleName.STAFF_ACCESS);
      if (!staffAccess || ACCESS_RANK[staffAccess.accessLevel] < ACCESS_RANK[AccessLevel.VIEW]) {
        throw new ConflictException(
          'STAFF_ACCESS must keep at least view access so the owner is never locked out',
        );
      }

      const activeFullAccessUsers = roles.reduce((total, item) => {
        const rolePermissions =
          item.id === role.id
            ? permissions
            : item.permissions ?? [];
        const hasFullStaffAccess = rolePermissions.some(
          (permission) =>
            permission.module === ModuleName.STAFF_ACCESS &&
            permission.accessLevel === AccessLevel.FULL,
        );
        return total + (hasFullStaffAccess ? (memberCounts.get(item.id) ?? 0) : 0);
      }, 0);
      if (activeFullAccessUsers === 0) {
        throw new ConflictException(
          'At least one active user must retain full staff-access permission',
        );
      }

      const permissionRepo = manager.getRepository(Permission);
      await permissionRepo.delete({ role: { id: role.id } });
      const insertedPermissions = await permissionRepo.save(
        permissions.map((permission) =>
          permissionRepo.create({
            role,
            module: permission.module,
            accessLevel: permission.accessLevel,
          }),
        ),
      );
      const updatedRole: Role = { ...role, permissions: insertedPermissions };
      return this.matrixRow(updatedRole, memberCounts.get(role.id) ?? 0);
    });
  }

  private assertCompletePermissionSet(permissions: PermissionEntryDto[]): void {
    const modules = Object.values(ModuleName);
    const supplied = permissions.map((permission) => permission.module);
    if (
      supplied.length !== modules.length ||
      new Set(supplied).size !== modules.length ||
      modules.some((module) => !supplied.includes(module))
    ) {
      throw new BadRequestException('Permissions must include exactly one entry for every module');
    }
  }

  private async activeUserCounts(manager: EntityManager): Promise<Map<string, number>> {
    const rows = await manager
      .getRepository(User)
      .createQueryBuilder('user')
      .select('role.id', 'roleId')
      .addSelect('COUNT(user.id)', 'memberCount')
      .innerJoin('user.role', 'role')
      .where('user.status = :status', { status: UserStatus.ACTIVE })
      .groupBy('role.id')
      .getRawMany<{ roleId: string; memberCount: string }>();
    return new Map(rows.map((row) => [row.roleId, Number(row.memberCount)]));
  }

  private canonicalPermissions(
    permissions: Array<{ module: ModuleName; accessLevel: AccessLevel }>,
  ): Array<{ module: ModuleName; accessLevel: AccessLevel }> {
    const levels = new Map(permissions.map((permission) => [permission.module, permission.accessLevel]));
    return Object.values(ModuleName)
      .sort()
      .map((module) => ({ module, accessLevel: levels.get(module) ?? AccessLevel.NONE }));
  }

  private permissionVersion(
    permissions: Array<{ module: ModuleName; accessLevel: AccessLevel }>,
  ): string {
    const canonical = this.canonicalPermissions(permissions);
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  private matrixRow(role: Role, memberCount: number): RolePermissionMatrixRow {
    const permissions = (role.permissions ?? []).map(({ id, module, accessLevel }) => ({
      id,
      module,
      accessLevel,
    }));
    return {
      id: role.id,
      name: role.name,
      permissions,
      accessLevels: Object.values(AccessLevel),
      version: this.permissionVersion(permissions),
      memberCount,
    };
  }

  private async getRole(name: RoleName): Promise<Role> {
    const role = await this.roleRepo.findOne({ where: { name } });
    if (!role) throw new NotFoundException(`Role ${name} not seeded`);
    return role;
  }
}
