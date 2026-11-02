import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { AppDataSource } from '../data-source';
import { RoleName, UserStatus } from '../../common/enums';
import { Permission } from '../../modules/users/entities/permission.entity';
import { Role } from '../../modules/users/entities/role.entity';
import { User } from '../../modules/users/entities/user.entity';
import {
  WholesaleAccount,
  WholesaleAccountStatus,
} from '../../modules/wholesale/entities/wholesale-account.entity';
import { PriceTier } from '../../modules/wholesale/entities/price-tier.entity';
import { Customer } from '../../modules/customers/entities/customer.entity';
import { PERMISSION_MATRIX } from './permission-matrix';
import { safeErrorMessage } from '../tools/db-tooling';
import {
  assertSafeSeedEnvironment,
  requireSeedPassword as getSeedPassword,
} from './seed-safety';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

export function requireSeedPassword(): string {
  try {
    return getSeedPassword();
  } catch (error) {
    fail(error instanceof Error ? error.message : 'SEED_USER_PASSWORD is invalid.');
  }
}

export function requireSafeEnvironment(): void {
  try {
    assertSafeSeedEnvironment();
  } catch (error) {
    fail(error instanceof Error ? error.message : 'Seed environment is invalid.');
  }
}

export { fail };

/** Reference data: roles, the permission matrix, one test user per role, and
 *  an approved wholesale account so the buyer portal is usable locally.
 *  Idempotent. */
async function seedData(): Promise<void> {
  const roleRepo = AppDataSource.getRepository(Role);
  const permissionRepo = AppDataSource.getRepository(Permission);
  const userRepo = AppDataSource.getRepository(User);

  // 1. Roles
  const roles = new Map<RoleName, Role>();
  for (const name of Object.values(RoleName)) {
    let role = await roleRepo.findOne({ where: { name } });
    if (!role) role = await roleRepo.save(roleRepo.create({ name }));
    roles.set(name, role);
  }
  console.log(`Roles: ${roles.size} present`);

  // 2. Permission matrix
  let permissionCount = 0;
  for (const [roleName, modules] of Object.entries(PERMISSION_MATRIX)) {
    const role = roles.get(roleName as RoleName)!;
    for (const [module, accessLevel] of Object.entries(modules)) {
      const existing = await permissionRepo.findOne({
        where: { role: { id: role.id }, module: module as Permission['module'] },
        relations: { role: true },
      });
      if (existing) {
        if (existing.accessLevel !== accessLevel) {
          existing.accessLevel = accessLevel;
          await permissionRepo.save(existing);
        }
      } else {
        await permissionRepo.save(
          permissionRepo.create({
            role,
            module: module as Permission['module'],
            accessLevel,
          }),
        );
      }
      permissionCount += 1;
    }
  }
  console.log(`Permissions: ${permissionCount} rows ensured`);

  // 3. One test user per role (local/dev only)
  const password = requireSeedPassword();
  const passwordHash = await bcrypt.hash(password, 10);
  const testUsers: Array<{ role: RoleName; email: string; name: string }> = [
    { role: RoleName.BUSINESS_OWNER_ADMIN, email: 'owner@seentair.test', name: 'Test Owner' },
    { role: RoleName.MANAGEMENT, email: 'manager@seentair.test', name: 'Test Manager' },
    { role: RoleName.SALES, email: 'sales@seentair.test', name: 'Test Sales' },
    { role: RoleName.INVENTORY, email: 'inventory@seentair.test', name: 'Test Inventory' },
    { role: RoleName.PRODUCTION, email: 'production@seentair.test', name: 'Test Production' },
    { role: RoleName.FINANCE_ACCOUNTING, email: 'finance@seentair.test', name: 'Test Finance' },
    { role: RoleName.PARTNER_INVESTOR, email: 'partner@seentair.test', name: 'Test Partner' },
    { role: RoleName.WHOLESALER, email: 'wholesaler@seentair.test', name: 'Test Wholesaler' },
    { role: RoleName.CUSTOMER, email: 'customer@seentair.test', name: 'Test Customer' },
  ];
  for (const { role, email, name } of testUsers) {
    const existing = await userRepo.findOne({ where: { email } });
    if (!existing) {
      await userRepo.save(
        userRepo.create({
          name,
          email,
          passwordHash,
          role: roles.get(role)!,
          status: UserStatus.ACTIVE,
        }),
      );
    }
  }
  console.log(`Users: ${testUsers.length} test users ensured`);

  // 4. Approved wholesale account for the test wholesaler.
  //
  // The WHOLESALER user above is not enough to sign in to the wholesale
  // portal. Every wholesale read (pricing, invoices, stock) calls
  // assertApprovedAccount(), which requires a wholesale_accounts row with
  // status = approved -- so the seeded wholesaler authenticated and then got
  // rejected on the first call. There is nothing to approve either, because
  // the row did not exist; admin review only works on an existing account.
  //
  // Approving in the seed keeps `npm run seed` sufficient on a fresh machine.
  // The discount below is a demo value: tier criteria are still Open
  // Question #2, so in production a staff member assigns the tier.
  const tierRepo = AppDataSource.getRepository(PriceTier);
  const accountRepo = AppDataSource.getRepository(WholesaleAccount);

  let demoTier = await tierRepo.findOne({ where: { name: 'Demo wholesale' } });
  if (!demoTier) {
    demoTier = await tierRepo.save(
      tierRepo.create({
        name: 'Demo wholesale',
        ruleDescription: 'Seeded for local development. Criteria pending Open Question #2.',
        discountPercent: 15,
      }),
    );
  }

  const wholesaler = await userRepo.findOne({
    where: { email: 'wholesaler@seentair.test' },
    relations: { role: true },
  });
  if (!wholesaler) throw new Error('seeded wholesaler user is missing');
  if (!(await accountRepo.findOne({ where: { user: { id: wholesaler.id } }, relations: { user: true } }))) {
    await accountRepo.save(
      accountRepo.create({
        user: wholesaler,
        status: WholesaleAccountStatus.APPROVED,
        tier: demoTier,
      }),
    );
  }
  console.log(
    `Wholesale account: approved for the test wholesaler on tier "${demoTier.name}" (${demoTier.discountPercent}% off)`,
  );

  // Seed some customers (stockists and shoppers) for the customer directory
  const customerRepo = AppDataSource.getRepository(Customer);
  const customerData: Array<{
    name: string;
    kind: 'stockist' | 'shopper';
    contact: string | null;
    email: string;
    phone: string | null;
    city: string | null;
    region: string | null;
    tags: string[] | null;
    note: string | null;
  }> = [
    {
      name: 'Juniper & Moss Apothecary',
      kind: 'stockist',
      contact: 'Clara Lindqvist',
      email: 'clara@junipermoss.com',
      phone: '(896) 555-0129',
      city: 'Portland',
      region: 'OR',
      tags: ['vip', 'net30'],
      note: 'Reorders the balm every 4–5 weeks. Prefers UPS.',
    },
    {
      name: 'The Fern Room',
      kind: 'stockist',
      contact: 'Marcus Bell',
      email: 'marcus@thefern.com',
      phone: '(503) 555-0125',
      city: 'Austin',
      region: 'TX',
      tags: ['net30'],
      note: '',
    },
    {
      name: 'Saltwater Pharmacy',
      kind: 'stockist',
      contact: 'Aisha Rahman',
      email: 'aisha@saltwaterpharmacy.com',
      phone: '(719) 555-0133',
      city: 'Charleston',
      region: 'SC',
      tags: ['vip'],
      note: '',
    },
    {
      name: 'Amara Nwosu',
      kind: 'shopper',
      contact: 'Amara Nwosu',
      email: 'amara.nwosu@mail.com',
      phone: '(289) 555-0184',
      city: 'Raleigh',
      region: 'NC',
      tags: ['subscriber'],
      note: '',
    },
    {
      name: 'Lena Fischer',
      kind: 'shopper',
      contact: 'Lena Fischer',
      email: 'lena.fischer@mail.com',
      phone: '(207) 555-0184',
      city: 'Chicago',
      region: 'IL',
      tags: [],
      note: '',
    },
    {
      name: 'Diego Castillo',
      kind: 'shopper',
      contact: 'Diego Castillo',
      email: 'diego.castillo@mail.com',
      phone: '(563) 555-0169',
      city: 'Phoenix',
      region: 'AZ',
      tags: ['subscriber'],
      note: '',
    },
  ];

  for (const cData of customerData) {
    const existing = await customerRepo.findOne({ where: { email: cData.email } });
    if (!existing) {
      await customerRepo.save(customerRepo.create(cData));
    }
  }
  console.log(`Customers: ${customerData.length} seeded`);
}

export async function seed(): Promise<void> {
  requireSafeEnvironment();
  requireSeedPassword();
  try {
    await AppDataSource.initialize();
    await seedData();
    console.log('Seed complete.');
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

// Only run when executed directly (e.g. `npm run seed`), not on import.
if (require.main === module) {
  seed().catch((err) => {
    console.error('Seed failed:', safeErrorMessage(err));
    process.exit(1);
  });
}
