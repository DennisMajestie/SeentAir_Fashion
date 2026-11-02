import { In } from 'typeorm';
import { randomBytes } from 'crypto';
import { AppDataSource } from '../data-source';
import { RoleName } from '../../common/enums';
import { Customer } from '../../modules/customers/entities/customer.entity';
import { Permission } from '../../modules/users/entities/permission.entity';
import { Role } from '../../modules/users/entities/role.entity';
import { User } from '../../modules/users/entities/user.entity';
import {
  WholesaleAccount,
  WholesaleAccountStatus,
} from '../../modules/wholesale/entities/wholesale-account.entity';
import { PriceTier } from '../../modules/wholesale/entities/price-tier.entity';
import { PERMISSION_MATRIX } from './permission-matrix';
import { seed } from './seed';

const TEST_USER_EMAILS = [
  'owner@seentair.test',
  'manager@seentair.test',
  'sales@seentair.test',
  'inventory@seentair.test',
  'production@seentair.test',
  'finance@seentair.test',
  'partner@seentair.test',
  'wholesaler@seentair.test',
  'customer@seentair.test',
];

const TEST_CUSTOMER_EMAILS = [
  'clara@junipermoss.com',
  'marcus@thefern.com',
  'aisha@saltwaterpharmacy.com',
  'amara.nwosu@mail.com',
  'lena.fischer@mail.com',
  'diego.castillo@mail.com',
];

const EXPECTED_PERMISSION_ROWS = Object.values(PERMISSION_MATRIX).reduce(
  (total, modules) => total + Object.keys(modules).length,
  0,
);

const describeDb = process.env.DB_SEED_TEST === 'true' ? describe : describe.skip;

describeDb('base seed against a disposable database', () => {
  jest.setTimeout(180_000);

  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    ALLOW_SEED: process.env.ALLOW_SEED,
    SEED_USER_PASSWORD: process.env.SEED_USER_PASSWORD,
  };

  beforeAll(() => {
    if (
      process.env.DATABASE_URL ||
      !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST ?? 'localhost') ||
      !/^[a-z0-9_]+_test$/i.test(process.env.DB_NAME ?? '')
    ) {
      throw new Error(
        'DB_SEED_TEST requires a local DB_HOST, an explicit *_test DB_NAME, and no DATABASE_URL.',
      );
    }
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_SEED = 'true';
    process.env.SEED_USER_PASSWORD = randomBytes(24).toString('base64url');
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('runs twice without duplicating reference data and closes the connection', async () => {
    await seed();
    expect(AppDataSource.isInitialized).toBe(false);

    await seed();
    expect(AppDataSource.isInitialized).toBe(false);

    await AppDataSource.initialize();
    try {
      const roleRepo = AppDataSource.getRepository(Role);
      const permissionRepo = AppDataSource.getRepository(Permission);
      const userRepo = AppDataSource.getRepository(User);
      const customerRepo = AppDataSource.getRepository(Customer);
      const tierRepo = AppDataSource.getRepository(PriceTier);
      const accountRepo = AppDataSource.getRepository(WholesaleAccount);

      expect(await roleRepo.count()).toBe(Object.values(RoleName).length);
      expect(await permissionRepo.count()).toBe(EXPECTED_PERMISSION_ROWS);
      expect(await userRepo.count({ where: { email: In(TEST_USER_EMAILS) } })).toBe(
        TEST_USER_EMAILS.length,
      );
      expect(
        await customerRepo.count({ where: { email: In(TEST_CUSTOMER_EMAILS) } }),
      ).toBe(TEST_CUSTOMER_EMAILS.length);

      const users = await userRepo.find({
        where: { email: In(TEST_USER_EMAILS) },
        relations: { role: true },
      });
      expect(new Set(users.map((user) => user.role.name))).toEqual(
        new Set(Object.values(RoleName)),
      );

      const wholesaler = users.find((user) => user.email === 'wholesaler@seentair.test');
      expect(wholesaler).toBeDefined();
      const account = await accountRepo.findOne({
        where: { user: { id: wholesaler!.id } },
        relations: { user: true },
      });
      expect(account?.status).toBe(WholesaleAccountStatus.APPROVED);
      expect(await accountRepo.count({ where: { user: { id: wholesaler!.id } } })).toBe(1);
      expect(await tierRepo.count({ where: { name: 'Demo wholesale' } })).toBe(1);
    } finally {
      if (AppDataSource.isInitialized) {
        await AppDataSource.destroy();
      }
    }
  });
});
