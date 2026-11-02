import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccessLevel, ModuleName, RoleName } from '../src/common/enums';
import { AccessGuard } from '../src/common/guards/access.guard';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PermissionsService } from '../src/modules/users/permissions.service';
import { MaterialsController } from '../src/modules/materials/materials.controller';
import { MaterialsService } from '../src/modules/materials/materials.service';
import { ApprovalsService } from '../src/modules/approvals/approvals.service';
import { InventoryController } from '../src/modules/inventory/inventory.controller';
import { InventoryCountsService } from '../src/modules/inventory/inventory-counts.service';
import { InventoryService } from '../src/modules/inventory/inventory.service';
import { HelpController } from '../src/modules/help/help.controller';
import { HelpService } from '../src/modules/help/help.service';

const JWT_SECRET = 'admin-operations-test-secret';
const MATERIAL_ID = '0b491dff-9704-4c33-9a7f-ae5d4ecb2bcf';
const TICKET_ID = 'bbf1a3b8-8e5b-4ee3-8564-2b9f1fcd6f04';

const permissionLevels: Record<string, Partial<Record<ModuleName, AccessLevel>>> = {
  [RoleName.BUSINESS_OWNER_ADMIN]: {
    [ModuleName.RAW_MATERIALS]: AccessLevel.FULL,
    [ModuleName.INVENTORY]: AccessLevel.FULL,
    [ModuleName.COMMUNICATION]: AccessLevel.FULL,
  },
  [RoleName.MANAGEMENT]: {
    [ModuleName.RAW_MATERIALS]: AccessLevel.VIEW,
    [ModuleName.INVENTORY]: AccessLevel.VIEW,
    [ModuleName.COMMUNICATION]: AccessLevel.VIEW,
  },
  [RoleName.INVENTORY]: {
    [ModuleName.RAW_MATERIALS]: AccessLevel.FULL,
    [ModuleName.INVENTORY]: AccessLevel.FULL,
  },
  [RoleName.SALES]: {
    [ModuleName.INVENTORY]: AccessLevel.VIEW,
    [ModuleName.COMMUNICATION]: AccessLevel.FULL,
  },
};

describe('Admin operations endpoints — signed staff tokens', () => {
  let app: INestApplication;
  let jwt: JwtService;

  const materials = {
    findPurchases: jest.fn(async () => ({ data: [], total: 0 })),
    recordPurchase: jest.fn(async () => ({ id: 'purchase-1' })),
  };
  const approvals = { assertApproved: jest.fn(async () => undefined) };
  const inventory = {
    summary: jest.fn(async () => []),
    verify: jest.fn(async () => ({})),
    digest: jest.fn(async () => ({})),
    movements: jest.fn(async () => ({ data: [], total: 0, currentQuantity: 0 })),
    recordStandalone: jest.fn(async () => ({})),
  };
  const counts = {
    list: jest.fn(async () => ({ data: [], total: 0 })),
    record: jest.fn(async (_dto: unknown, actorId: string) => ({ createdBy: actorId })),
  };
  const help = {
    articles: jest.fn(() => [{ id: 'inventory', title: 'Inventory' }]),
    listTickets: jest.fn(async () => [[], 0]),
    createTicket: jest.fn(async (_dto: unknown, actorId: string) => ({ createdBy: actorId })),
    updateTicketStatus: jest.fn(async (_id: string, status: string, actorId: string) => ({
      status,
      updatedBy: actorId,
    })),
  };
  const permissions = {
    getAccessLevel: jest.fn(async (role: RoleName, module: ModuleName) =>
      permissionLevels[role]?.[module] ?? AccessLevel.NONE,
    ),
  };

  beforeAll(async () => {
    jwt = new JwtService({ secret: JWT_SECRET });
    const moduleRef = await Test.createTestingModule({
      controllers: [MaterialsController, InventoryController, HelpController],
      providers: [
        { provide: MaterialsService, useValue: materials },
        { provide: ApprovalsService, useValue: approvals },
        { provide: InventoryService, useValue: inventory },
        { provide: InventoryCountsService, useValue: counts },
        { provide: HelpService, useValue: help },
        { provide: PermissionsService, useValue: permissions },
        Reflector,
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: new ConfigService({ jwt: { secret: JWT_SECRET } }) },
        {
          provide: APP_GUARD,
          useFactory: (
            reflector: Reflector,
            jwtService: JwtService,
            config: ConfigService,
          ) => new JwtAuthGuard(jwtService, reflector, config),
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
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => app?.close());
  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function signedToken(role: RoleName): Promise<string> {
    return jwt.signAsync({
      sub: `user-${role}`,
      email: `${role}@example.test`,
      role,
      type: 'access',
    });
  }

  async function authenticated(role: RoleName) {
    return `Bearer ${await signedToken(role)}`;
  }

  it('lets management read purchase history but not record a purchase', async () => {
    const token = await authenticated(RoleName.MANAGEMENT);
    await request(app.getHttpServer())
      .get('/materials/purchases?page=2&limit=10')
      .set('Authorization', token)
      .expect(200);
    expect(materials.findPurchases).toHaveBeenCalledWith(2, 10);

    await request(app.getHttpServer())
      .post(`/materials/${MATERIAL_ID}/purchase`)
      .set('Authorization', token)
      .send({ quantity: 2, cost: 200, approvalRequestId: TICKET_ID })
      .expect(403);
    expect(materials.recordPurchase).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .post(`/materials/${MATERIAL_ID}/purchase`)
      .set('Authorization', await authenticated(RoleName.BUSINESS_OWNER_ADMIN))
      .send({ quantity: 2, cost: 200, approvalRequestId: TICKET_ID })
      .expect(201);
    expect(approvals.assertApproved).toHaveBeenCalled();
    expect(materials.recordPurchase).toHaveBeenCalled();
  });

  it('allows full-access inventory staff to record counts and rejects view-only count writes', async () => {
    const managerToken = await authenticated(RoleName.MANAGEMENT);
    const ownerToken = await authenticated(RoleName.BUSINESS_OWNER_ADMIN);
    const body = {
      items: [{ itemType: 'variant', itemId: MATERIAL_ID, countedQuantity: 2 }],
    };

    await request(app.getHttpServer())
      .get('/inventory/counts')
      .set('Authorization', managerToken)
      .expect(200);
    await request(app.getHttpServer())
      .post('/inventory/counts')
      .set('Authorization', managerToken)
      .send(body)
      .expect(403);
    expect(counts.record).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .post('/inventory/counts')
      .set('Authorization', ownerToken)
      .send(body)
      .expect(201);
    expect(counts.record).toHaveBeenCalledWith(body, `user-${RoleName.BUSINESS_OWNER_ADMIN}`);
  });

  it('allows view-only communication access to read articles and tickets, not create tickets', async () => {
    const token = await authenticated(RoleName.MANAGEMENT);
    await request(app.getHttpServer())
      .get('/help/articles')
      .set('Authorization', token)
      .expect(200);
    await request(app.getHttpServer())
      .get('/help/tickets')
      .set('Authorization', token)
      .expect(200);
    await request(app.getHttpServer())
      .post('/help/tickets')
      .set('Authorization', token)
      .send({ subject: 'Need support', description: 'Please help with a staff issue.' })
      .expect(403);
    expect(help.createTicket).not.toHaveBeenCalled();
  });

  it('attributes a full-access staff ticket creation to its signed-in user', async () => {
    const token = await authenticated(RoleName.BUSINESS_OWNER_ADMIN);
    await request(app.getHttpServer())
      .post('/help/tickets')
      .set('Authorization', token)
      .send({ subject: 'Need support', description: 'Please help with a staff issue.' })
      .expect(201);
    expect(help.createTicket).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Need support' }),
      `user-${RoleName.BUSINESS_OWNER_ADMIN}`,
    );
  });

  it('rejects unauthenticated requests before they reach a handler', async () => {
    await request(app.getHttpServer()).get('/help/articles').expect(401);
    expect(help.articles).not.toHaveBeenCalled();
  });
});
