import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { AccessLevel, ModuleName, RoleName, UserStatus } from '../../common/enums';
import { Permission } from './entities/permission.entity';
import { RefreshToken } from '../auth/refresh-token.entity';
import { Role } from './entities/role.entity';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

type PermissionInput = { module: ModuleName; accessLevel: AccessLevel };

function permissionSet(
  overrides: Partial<Record<ModuleName, AccessLevel>> = {},
): PermissionInput[] {
  return Object.values(ModuleName).map((module) => ({
    module,
    accessLevel: overrides[module] ?? AccessLevel.NONE,
  }));
}

function role(
  id: string,
  name: RoleName,
  staffAccess: AccessLevel,
): Role {
  return {
    id,
    name,
    permissions: [
      {
        id: `${id}-staff-access`,
        module: ModuleName.STAFF_ACCESS,
        accessLevel: staffAccess,
      } as Permission,
    ],
  } as Role;
}

function makeHarness(
  roles: Role[],
  activeCounts: Array<{ roleId: string; memberCount: string }> = [],
) {
  const builder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(async () => activeCounts),
  };
  const txRoleRepo = { find: jest.fn(async () => roles) };
  const txPermissionRepo = {
    create: jest.fn((value) => value),
    delete: jest.fn(async () => ({ affected: 1 })),
    save: jest.fn(async (rows: Array<Record<string, unknown>>) =>
      rows.map((row, index) => ({ ...row, id: `saved-${index}` })),
    ),
  };
  const txRefreshTokenRepo = {
    update: jest.fn(async () => ({ affected: 1 })),
  };
  const txUserRepo = { findOne: jest.fn(async (params: any) => {
      if (params.where?.id === 'user-id') return { id: 'user-id', name: 'Test User', role: RoleName.SALES, status: UserStatus.DISABLED };
      return null;
    }), createQueryBuilder: jest.fn(() => builder), save: jest.fn(async (u: any) => u) };
  const manager = {
    query: jest.fn(async () => undefined),
    getRepository: jest.fn((entity: unknown) => {
      if (entity === Role) return txRoleRepo;
      if (entity === Permission) return txPermissionRepo;
      if (entity === RefreshToken) return txRefreshTokenRepo;
      if (entity === User) return txUserRepo;
      throw new Error('Unexpected repository');
    }),
  } as unknown as EntityManager;
  const dataSource = {
    manager,
    transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<unknown>) =>
      callback(manager),
    ),
  } as unknown as DataSource;
  const roleRepo = { find: jest.fn(async () => roles) };
  const userRepo = txUserRepo;
  const permissionRepo = {};
  const service = new UsersService(
    userRepo as never,
    roleRepo as never,
    permissionRepo as never,
    txRefreshTokenRepo as never,
    dataSource,
  );

  return {
    service,
    dataSource,
    manager,
    builder,
    roleRepo: userRepo,
    txPermissionRepo: txPermissionRepo,
    refreshTokenRepo: txRefreshTokenRepo,
    userRepo,
  };
}

describe('UsersService role permission matrix', () => {
  it('rejects owner and external role edits before opening a transaction', async () => {
    const harness = makeHarness([]);
    const permissions = permissionSet({ [ModuleName.STAFF_ACCESS]: AccessLevel.FULL });

    await expect(
      harness.service.updateRolePermissions(RoleName.BUSINESS_OWNER_ADMIN, permissions),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      harness.service.updateRolePermissions(RoleName.CUSTOMER, permissions),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      harness.service.updateRolePermissions(RoleName.WHOLESALER, permissions),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      harness.service.updateRolePermissions(RoleName.PARTNER_INVESTOR, permissions),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(harness.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects incomplete or duplicate replacement sets', async () => {
    const harness = makeHarness([role('management-id', RoleName.MANAGEMENT, AccessLevel.FULL)]);
    const incomplete = permissionSet({ [ModuleName.STAFF_ACCESS]: AccessLevel.FULL }).slice(1);
    const duplicate = [...permissionSet({ [ModuleName.STAFF_ACCESS]: AccessLevel.FULL })];
    duplicate[duplicate.length - 1] = { ...duplicate[0] };

    await expect(
      harness.service.updateRolePermissions(RoleName.MANAGEMENT, incomplete),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      harness.service.updateRolePermissions(RoleName.MANAGEMENT, duplicate),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('keeps at least one active full staff-access holder in the same transaction', async () => {
    const onlyHolder = role('management-id', RoleName.MANAGEMENT, AccessLevel.FULL);
    const harness = makeHarness([onlyHolder], [{ roleId: onlyHolder.id, memberCount: '1' }]);
    const permissions = permissionSet({ [ModuleName.STAFF_ACCESS]: AccessLevel.VIEW });

    await expect(
      harness.service.updateRolePermissions(RoleName.MANAGEMENT, permissions),
    ).rejects.toThrow('At least one active user must retain full staff-access permission');
    expect(harness.manager.query).toHaveBeenCalled();
    expect(harness.txPermissionRepo.delete).not.toHaveBeenCalled();
    expect(harness.txPermissionRepo.save).not.toHaveBeenCalled();
  });

  it('allows the change when a different active role retains full staff access', async () => {
    const management = role('management-id', RoleName.MANAGEMENT, AccessLevel.FULL);
    const owner = role('owner-id', RoleName.BUSINESS_OWNER_ADMIN, AccessLevel.FULL);
    const harness = makeHarness(
      [management, owner],
      [
        { roleId: management.id, memberCount: '2' },
        { roleId: owner.id, memberCount: '1' },
      ],
    );
    const permissions = permissionSet({ [ModuleName.STAFF_ACCESS]: AccessLevel.VIEW });

    await expect(
      harness.service.updateRolePermissions(RoleName.MANAGEMENT, permissions),
    ).resolves.toMatchObject({ name: RoleName.MANAGEMENT, memberCount: 2 });
    expect(harness.txPermissionRepo.delete).toHaveBeenCalledWith({ role: { id: management.id } });
    expect(harness.txPermissionRepo.save).toHaveBeenCalledTimes(1);
  });

  it('returns grouped active-member counts and stable role versions', async () => {
    const sales = role('sales-id', RoleName.SALES, AccessLevel.VIEW);
    const harness = makeHarness([sales], [{ roleId: sales.id, memberCount: '3' }]);

    const [row] = await harness.service.getPermissionMatrix();
    expect(row).toMatchObject({ id: sales.id, name: RoleName.SALES, memberCount: 3 });
    expect(row.version).toMatch(/^[a-f\d]{64}$/);
    expect(harness.builder.groupBy).toHaveBeenCalledWith('role.id');
    expect(row.permissions[0]).toEqual(
      expect.objectContaining({ module: ModuleName.STAFF_ACCESS, accessLevel: AccessLevel.VIEW }),
    );
  });

  it('accepts a matching or absent baseVersion and rejects a stale version', async () => {
    const management = role('management-id', RoleName.MANAGEMENT, AccessLevel.FULL);
    const owner = role('owner-id', RoleName.BUSINESS_OWNER_ADMIN, AccessLevel.FULL);
    const harness = makeHarness(
      [management, owner],
      [
        { roleId: management.id, memberCount: '1' },
        { roleId: owner.id, memberCount: '1' },
      ],
    );
    const current = await harness.service.getPermissionMatrix();
    const permissions = permissionSet({ [ModuleName.STAFF_ACCESS]: AccessLevel.FULL });

    await expect(
      harness.service.updateRolePermissions(
        RoleName.MANAGEMENT,
        permissions,
        current.find((item) => item.name === RoleName.MANAGEMENT)!.version,
      ),
    ).resolves.toMatchObject({ name: RoleName.MANAGEMENT });
    harness.txPermissionRepo.delete.mockClear();
    harness.txPermissionRepo.save.mockClear();
    await expect(
      harness.service.updateRolePermissions(RoleName.MANAGEMENT, permissions, '0'.repeat(64)),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.txPermissionRepo.delete).not.toHaveBeenCalled();
    await expect(
      harness.service.updateRolePermissions(RoleName.MANAGEMENT, permissions),
    ).resolves.toMatchObject({ name: RoleName.MANAGEMENT });
  });
});

describe('deactivate', () => {
  it('sets status to DISABLED and revokes all refresh tokens', async () => {
    const harness = makeHarness([
      role('user-id', RoleName.SALES, AccessLevel.FULL),
    ]);
    const service = new UsersService(
      harness.userRepo as never,
      harness.roleRepo as never,
      harness.txPermissionRepo as never,
      harness.refreshTokenRepo as never,
      harness.dataSource,
    );

    const result = await service.deactivate('user-id');

    expect(result.status).toBe(UserStatus.DISABLED);
    expect(harness.refreshTokenRepo.update).toHaveBeenCalledWith(
      { userId: 'user-id', revokedAt: IsNull() },
      { revokedAt: expect.any(Date) },
    );
  });

  it('throws NotFoundException when user does not exist', async () => {
    const harness = makeHarness([]);
    const service = new UsersService(
      harness.userRepo as never,
      harness.roleRepo as never,
      harness.txPermissionRepo as never,
      harness.refreshTokenRepo as never,
      harness.dataSource,
    );

    await expect(service.deactivate('nonexistent')).rejects.toThrow(NotFoundException);
  });
});

describe('activate', () => {
  it('sets status to ACTIVE without changing the assigned role', async () => {
    const harness = makeHarness([
      role('user-id', RoleName.SALES, AccessLevel.FULL),
    ]);
    const service = new UsersService(
      harness.userRepo as never,
      harness.roleRepo as never,
      harness.txPermissionRepo as never,
      harness.refreshTokenRepo as never,
      harness.dataSource,
    );

    const result = await service.activate('user-id');

    expect(harness.userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-id', status: UserStatus.ACTIVE, role: RoleName.SALES }),
    );
    expect(result.role).toBe(RoleName.SALES);
  });

  it('throws NotFoundException when user does not exist', async () => {
    const harness = makeHarness([]);
    const service = new UsersService(
      harness.userRepo as never,
      harness.roleRepo as never,
      harness.txPermissionRepo as never,
      harness.refreshTokenRepo as never,
      harness.dataSource,
    );

    await expect(service.activate('nonexistent')).rejects.toThrow(NotFoundException);
  });
});
