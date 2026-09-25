import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { ACCESS_RANK, AccessLevel, ModuleName, RoleName } from '../../common/enums';
import { CreateUserDto } from './dto/create-user.dto';
import { PermissionEntryDto } from './dto/update-permissions.dto';
import { Permission } from './entities/permission.entity';
import { Role } from './entities/role.entity';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(Permission) private readonly permissionRepo: Repository<Permission>,
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

  async updateRole(id: string, roleName: RoleName): Promise<User> {
    const user = await this.findById(id);
    user.role = await this.getRole(roleName);
    await this.userRepo.save(user);
    return this.findById(id);
  }

  /** Full role × module permission dot-matrix for the staff-access screen. */
  async getPermissionMatrix(): Promise<Role[]> {
    return this.roleRepo.find({
      relations: { permissions: true },
      order: { name: 'ASC' },
    });
  }

  /**
   * Replace the whole permission set for one role (PUT semantics). At least
   * one module must be granted, and every role must keep STAFF_ACCESS so the
   * owner is never locked out of managing access.
   */
  async updateRolePermissions(
    roleName: RoleName,
    permissions: PermissionEntryDto[],
  ): Promise<Role> {
    const role = await this.getRole(roleName);
    if (
      ACCESS_RANK[
        permissions.find((p) => p.module === ModuleName.STAFF_ACCESS)?.accessLevel ??
          AccessLevel.NONE
      ] < ACCESS_RANK[AccessLevel.VIEW]
    ) {
      throw new ConflictException(
        'STAFF_ACCESS must keep at least view access so the owner is never locked out',
      );
    }
    await this.permissionRepo.delete({ role: { id: role.id } });
    await this.permissionRepo.save(
      permissions.map((p) =>
        this.permissionRepo.create({ role, module: p.module, accessLevel: p.accessLevel }),
      ),
    );
    const updated = await this.roleRepo.findOne({
      where: { name: roleName },
      relations: { permissions: true },
    });
    if (!updated) throw new NotFoundException(`Role ${roleName} not found`);
    return updated;
  }

  private async getRole(name: RoleName): Promise<Role> {
    const role = await this.roleRepo.findOne({ where: { name } });
    if (!role) throw new NotFoundException(`Role ${name} not seeded`);
    return role;
  }
}
