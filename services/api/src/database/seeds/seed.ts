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
import { PERMISSION_MATRIX } from './permission-matrix';

/** Reference data: roles, the permission matrix, one test user per role, and
 *  an approved wholesale account so the buyer portal is usable locally.
 *  Idempotent. */
async function seed(): Promise<void> {
  await AppDataSource.initialize();
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
  const password = process.env.SEED_USER_PASSWORD ?? 'Password123!';
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
  console.log(`Users: ${testUsers.length} test users ensured (password: $SEED_USER_PASSWORD)`);

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
    `Wholesale account: approved for ${wholesaler.email} on tier "${demoTier.name}" (${demoTier.discountPercent}% off)`,
  );

  await AppDataSource.destroy();
  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
