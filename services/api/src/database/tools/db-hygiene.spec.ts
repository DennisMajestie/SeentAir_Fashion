import { assertReadOnlyAllowed, runReadOnly } from './db-tooling';
import { buildHygieneReport, summarizeShippingStates } from './db-hygiene';

describe('db:hygiene production guard', () => {
  it('refuses production without ALLOW_PROD_READONLY=true', () => {
    expect(() =>
      assertReadOnlyAllowed('db:hygiene', {
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv),
    ).toThrow(/db:hygiene/);
  });

  it('allows production when ALLOW_PROD_READONLY=true', () => {
    expect(() =>
      assertReadOnlyAllowed('db:hygiene', {
        NODE_ENV: 'production',
        ALLOW_PROD_READONLY: 'true',
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('allows non-production without the override', () => {
    expect(() =>
      assertReadOnlyAllowed('db:hygiene', {
        NODE_ENV: 'development',
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});

describe('db:hygiene shipping-state summary', () => {
  it('separates known states from unknown and empty values', () => {
    const summary = summarizeShippingStates([
      { state: 'Lagos', count: 2 },
      { state: 'fct', count: 1 },
      { state: 'Atlantis', count: 3 },
      { state: '', count: 1 },
    ]);

    expect(summary.knownOrderCount).toBe(3);
    expect(summary.unknownOrderCount).toBe(4);
    expect(summary.distinctUnknown).toBe(2);
    expect(summary.unknown.map((row) => row.state)).toEqual(['Atlantis', '']);
  });
});

const describeDb = process.env.DB_HYGIENE_TEST === 'true' ? describe : describe.skip;

describeDb('db:hygiene against a disposable database', () => {
  jest.setTimeout(120_000);

  it('produces a count-only report without raw email addresses', async () => {
    const report = await runReadOnly(buildHygieneReport);
    const serialized = JSON.stringify(report);
    const personalFields = new Set([
      'name',
      'email',
      'phone',
      'address',
      'contact',
      'guestName',
      'guestEmail',
    ]);
    const visitKeys = (value: unknown): string[] => {
      if (Array.isArray(value)) return value.flatMap(visitKeys);
      if (typeof value !== 'object' || value === null) return [];
      return Object.entries(value).flatMap(([key, child]) => [key, ...visitKeys(child)]);
    };

    expect(report.tool).toBe('db:hygiene');
    expect(report.version).toBe(1);
    expect(report.testUsers.every((row) => row.count >= 0)).toBe(true);
    expect(report.images.productsWithoutPrimary).toBeGreaterThanOrEqual(0);
    expect(report.images.variantsWithoutImage).toBeGreaterThanOrEqual(0);
    expect(report.stockMovements.variantsWithoutMovements).toBeGreaterThanOrEqual(0);
    expect(report.staleAwaitingPayment.thresholdHours).toBeGreaterThan(0);
    expect(report.refreshTokens.total).toBeGreaterThanOrEqual(0);
    expect(serialized).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(serialized).not.toMatch(/\+?\d[\d\s().-]{7,}\d/);
    expect(visitKeys(report).some((key) => personalFields.has(key))).toBe(false);
    expect(serialized).not.toContain('@seentair.test');
  });
});
