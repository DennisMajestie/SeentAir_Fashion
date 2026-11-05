import { ConflictException, ForbiddenException, INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccessLevel, ModuleName, RoleName } from '../../common/enums';
import { AccessGuard } from '../../common/guards/access.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuditInterceptor } from '../../common/interceptors/audit.interceptor';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from './permissions.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { MaterialsController } from '../materials/materials.controller';
import { MaterialsService } from '../materials/materials.service';
import { ApprovalsService } from '../approvals/approvals.service';

const JWT_SECRET = 'users-permissions-test-secret';
const ALL_PERMISSIONS = Object.values(ModuleName).map((module) => ({
  module,
  accessLevel: AccessLevel.NONE,
}));

describe('UsersController — signed role permission requests', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let service: {
    getPermissionMatrix: jest.Mock;
    updateRolePermissions: jest.Mock;
  };
  const audit = { record: jest.fn(async () => undefined) };
  let permissionRows: Record<RoleName, Map<ModuleName, AccessLevel>>;
  const materials = { findAll: jest.fn(async () => []) };

  beforeAll(async () => {
    jwt = new JwtService({ secret: JWT_SECRET });
    permissionRows = {
      [RoleName.BUSINESS_OWNER_ADMIN]: new Map([
        [ModuleName.STAFF_ACCESS, AccessLevel.FULL],
        [ModuleName.RAW_MATERIALS, AccessLevel.FULL],
      ]),
      [RoleName.MANAGEMENT]: new Map([
        [ModuleName.STAFF_ACCESS, AccessLevel.FULL],
        [ModuleName.RAW_MATERIALS, AccessLevel.FULL],
      ]),
      [RoleName.SALES]: new Map([
        [ModuleName.STAFF_ACCESS, AccessLevel.VIEW],
        [ModuleName.RAW_MATERIALS, AccessLevel.VIEW],
      ]),
      [RoleName.INVENTORY]: new Map([
        [ModuleName.STAFF_ACCESS, AccessLevel.VIEW],
        [ModuleName.RAW_MATERIALS, AccessLevel.FULL],
      ]),
      [RoleName.PRODUCTION]: new Map(),
      [RoleName.FINANCE_ACCOUNTING]: new Map(),
      [RoleName.PARTNER_INVESTOR]: new Map(),
      [RoleName.WHOLESALER]: new Map(),
      [RoleName.CUSTOMER]: new Map(),
    };
    service = {
      getPermissionMatrix: jest.fn(async () => []),
      updateRolePermissions: jest.fn(async (role: RoleName, permissions: typeof ALL_PERMISSIONS) => {
        if (role === RoleName.BUSINESS_OWNER_ADMIN) {
          throw new ConflictException('Business owner permissions are system-managed');
        }
        if ([RoleName.CUSTOMER, RoleName.WHOLESALER, RoleName.PARTNER_INVESTOR].includes(role)) {
          throw new ForbiddenException('External role permissions cannot be changed');
        }
        permissionRows[role] = new Map(permissions.map(({ module, accessLevel }) => [module, accessLevel]));
        return {
          id: `role-${role}`,
          name: role,
          permissions,
          version: 'a'.repeat(64),
          memberCount: 1,
        };
      }),
    };
    const permissions = {
      getAccessLevel: jest.fn(async (role: RoleName, module: ModuleName) =>
        permissionRows[role]?.get(module) ?? AccessLevel.NONE,
      ),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController, MaterialsController],
      providers: [
        { provide: UsersService, useValue: service },
        { provide: AuditService, useValue: audit },
        { provide: MaterialsService, useValue: materials },
        { provide: ApprovalsService, useValue: { assertApproved: jest.fn() } },
        { provide: PermissionsService, useValue: permissions },
        Reflector,
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: new ConfigService({ jwt: { secret: JWT_SECRET } }) },
        {
          provide: APP_GUARD,
          useFactory: (reflector: Reflector, jwtService: JwtService, config: ConfigService) =>
            new JwtAuthGuard(jwtService, reflector, config),
          inject: [Reflector, JwtService, ConfigService],
        },
        {
          provide: APP_GUARD,
          useFactory: (reflector: Reflector, permissionService: PermissionsService) =>
            new AccessGuard(reflector, permissionService),
          inject: [Reflector, PermissionsService],
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalInterceptors(new AuditInterceptor(audit as never));
    await app.init();
  });

  afterAll(async () => app?.close());

  async function bearer(role: RoleName): Promise<string> {
    return `Bearer ${await jwt.signAsync({
      sub: `user-${role}`,
      email: `${role}@example.test`,
      role,
      type: 'access',
    })}`;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    permissionRows[RoleName.SALES].set(ModuleName.STAFF_ACCESS, AccessLevel.VIEW);
    permissionRows[RoleName.SALES].set(ModuleName.RAW_MATERIALS, AccessLevel.VIEW);
  });

  it('rejects an owner-role permission write through the signed API route', async () => {
    const permissions = ALL_PERMISSIONS.map((row) => ({ ...row }));
    permissions.find((row) => row.module === ModuleName.STAFF_ACCESS)!.accessLevel = AccessLevel.FULL;
    await request(app.getHttpServer())
      .put('/api/v1/users/roles/business_owner_admin/permissions')
      .set('Authorization', await bearer(RoleName.BUSINESS_OWNER_ADMIN))
      .send({ permissions })
      .expect(409);
  });

  it('allows staff-access view to read the matrix but not write it', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users/roles')
      .set('Authorization', await bearer(RoleName.SALES))
      .expect(200);
    await request(app.getHttpServer())
      .put('/api/v1/users/roles/sales/permissions')
      .set('Authorization', await bearer(RoleName.SALES))
      .send({ permissions: ALL_PERMISSIONS })
      .expect(403);
    expect(service.updateRolePermissions).not.toHaveBeenCalled();
  });

  it('allows full staff access to save the legacy body without optional fields', async () => {
    const permissions = ALL_PERMISSIONS.map((row) => ({ ...row }));
    permissions.find((row) => row.module === ModuleName.STAFF_ACCESS)!.accessLevel = AccessLevel.FULL;
    await request(app.getHttpServer())
      .put('/api/v1/users/roles/management/permissions')
      .set('Authorization', await bearer(RoleName.MANAGEMENT))
      .send({ permissions })
      .expect(200);
    expect(service.updateRolePermissions).toHaveBeenCalledWith(
      RoleName.MANAGEMENT,
      permissions,
      undefined,
    );
  });

  it('records an optional trimmed reason in the audit after-state', async () => {
    const permissions = ALL_PERMISSIONS.map((row) => ({ ...row }));
    permissions.find((row) => row.module === ModuleName.STAFF_ACCESS)!.accessLevel = AccessLevel.FULL;
    await request(app.getHttpServer())
      .put('/api/v1/users/roles/management/permissions')
      .set('Authorization', await bearer(RoleName.MANAGEMENT))
      .send({ permissions, reason: ' Quarterly access review ' })
      .expect(200)
      .expect(({ body }) => expect(body.reason).toBe('Quarterly access review'));

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PUT /api/v1/users/roles/:roleName/permissions',
        afterState: expect.objectContaining({ reason: 'Quarterly access review' }),
      }),
    );
  });

  it('rejects customer and wholesaler tokens on both matrix routes', async () => {
    for (const role of [RoleName.CUSTOMER, RoleName.WHOLESALER]) {
      const token = await bearer(role);
      await request(app.getHttpServer()).get('/api/v1/users/roles').set('Authorization', token).expect(403);
      await request(app.getHttpServer())
        .put(`/api/v1/users/roles/${role}/permissions`)
        .set('Authorization', token)
        .send({ permissions: ALL_PERMISSIONS })
        .expect(403);
    }
    expect(service.getPermissionMatrix).not.toHaveBeenCalled();
    expect(service.updateRolePermissions).not.toHaveBeenCalled();
  });

  it('validates unknown modules, levels, and incomplete replacement bodies', async () => {
    const token = await bearer(RoleName.MANAGEMENT);
    const unknownModule = ALL_PERMISSIONS.map((row) => ({ ...row }));
    unknownModule[0] = { module: 'made_up' as ModuleName, accessLevel: AccessLevel.NONE };
    const unknownLevel = ALL_PERMISSIONS.map((row) => ({ ...row }));
    unknownLevel[0] = { module: ModuleName.MANUFACTURING, accessLevel: 'god_mode' as AccessLevel };

    await request(app.getHttpServer())
      .put('/api/v1/users/roles/management/permissions')
      .set('Authorization', token)
      .send({ permissions: unknownModule })
      .expect(400);
    await request(app.getHttpServer())
      .put('/api/v1/users/roles/management/permissions')
      .set('Authorization', token)
      .send({ permissions: unknownLevel })
      .expect(400);
    await request(app.getHttpServer())
      .put('/api/v1/users/roles/management/permissions')
      .set('Authorization', token)
      .send({ permissions: ALL_PERMISSIONS.slice(1) })
      .expect(400);
    expect(service.updateRolePermissions).not.toHaveBeenCalled();
  });

  it('applies a saved matrix on the next guarded request', async () => {
    const permissions = ALL_PERMISSIONS.map((row) => ({ ...row }));
    permissions.find((row) => row.module === ModuleName.STAFF_ACCESS)!.accessLevel = AccessLevel.FULL;
    permissions.find((row) => row.module === ModuleName.RAW_MATERIALS)!.accessLevel = AccessLevel.NONE;
    const token = await bearer(RoleName.MANAGEMENT);

    await request(app.getHttpServer())
      .put('/api/v1/users/roles/management/permissions')
      .set('Authorization', token)
      .send({ permissions })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/materials')
      .set('Authorization', token)
      .expect(403);
    expect(materials.findAll).not.toHaveBeenCalled();
  });
});