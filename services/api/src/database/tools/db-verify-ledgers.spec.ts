import { assertReadOnlyAllowed, runReadOnly } from './db-tooling';
import { buildVerifyLedgersReport } from './db-verify-ledgers';

describe('db:verify-ledgers production guard', () => {
  it('refuses production without ALLOW_PROD_READONLY=true', () => {
    expect(() =>
      assertReadOnlyAllowed('db:verify-ledgers', {
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv),
    ).toThrow(/db:verify-ledgers/);
  });

  it('allows production when ALLOW_PROD_READONLY=true', () => {
    expect(() =>
      assertReadOnlyAllowed('db:verify-ledgers', {
        NODE_ENV: 'production',
        ALLOW_PROD_READONLY: 'true',
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('allows non-production without the override', () => {
    expect(() =>
      assertReadOnlyAllowed('db:verify-ledgers', {
        NODE_ENV: 'development',
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});

const describeDb =
  process.env.DB_VERIFY_LEDGERS_TEST === 'true' ? describe : describe.skip;

describeDb('db:verify-ledgers against a disposable database', () => {
  jest.setTimeout(120_000);

  it('reports both ledgers as valid', async () => {
    const report = await runReadOnly(buildVerifyLedgersReport);

    expect(report.tool).toBe('db:verify-ledgers');
    expect(report.version).toBe(1);
    expect(report.inventory.broken).toBe(0);
    expect(report.inventory.passed).toBe(true);
    expect(report.inventory.firstBroken).toBeNull();
    expect(report.audit.broken).toBe(0);
    expect(report.audit.passed).toBe(true);
    expect(report.audit.firstBroken).toBeNull();
  });
});
