import { navFor } from './nav';

/** The access maps the API returns for three seeded roles (GET /auth/me). */
const OWNER = Object.fromEntries(
  [
    'manufacturing',
    'raw_materials',
    'catalogue',
    'inventory',
    'retail_orders',
    'wholesale_orders',
    'custom_orders',
    'payments',
    'returns',
    'accounting',
    'logistics',
    'marketing',
    'analytics',
    'partners',
    'staff_access',
    'approvals_audit',
    'communication',
  ].map((m) => [m, 'full']),
);
const INVENTORY = {
  analytics: 'view',
  catalogue: 'view',
  inventory: 'full',
  logistics: 'view',
  manufacturing: 'view',
  raw_materials: 'full',
  retail_orders: 'view',
  returns: 'view',
  wholesale_orders: 'view',
};
const labels = (access: Record<string, string> | null): string[] =>
  navFor(access).flatMap((g) => g.items.map((i) => i.label));

describe('navFor', () => {
  it('gives the owner every screen', () => {
    expect(labels(OWNER).length).toBe(22);
  });

  it('gives the Inventory role a visibly smaller app, with nothing greyed out', () => {
    const nav = labels(INVENTORY);
    expect(nav.length).toBeLessThan(labels(OWNER).length);
    expect(nav).toContain('Inventory');
    expect(nav).toContain('Materials');
    // Not theirs: absent, not disabled.
    for (const hidden of [
      'Approvals',
      'Accounting',
      'Staff',
      'Audit log',
      'Marketing',
      'Partners',
    ]) {
      expect(nav).withContext(hidden).not.toContain(hidden);
    }
  });

  it('shows Approvals only to a role that can decide a request, not one that can merely view', () => {
    expect(labels({ approvals_audit: 'view' })).not.toContain('Approvals');
    expect(labels({ approvals_audit: 'approve' })).toContain('Approvals');
  });

  it('shows only the screens open to everyone until the access map has loaded', () => {
    expect(labels(null)).toEqual(['Home', 'Security']);
  });

  it('drops a group that has nothing left in it', () => {
    const groups = navFor({ inventory: 'full' }).map((g) => g.title);
    expect(groups).not.toContain('Business');
    expect(groups).toContain('Product');
  });

  it('puts the waiting count on Approvals, and no badge when nothing is waiting', () => {
    const approvals = (count: number) =>
      navFor(OWNER, { approvals: count })
        .flatMap((g) => g.items)
        .find((i) => i.label === 'Approvals')!;
    expect(approvals(3).badge).toBe(3);
    expect(approvals(0).badge).toBeUndefined();
  });
});
