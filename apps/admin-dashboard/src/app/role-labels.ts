const ROLE_LABELS: Record<string, string> = {
  business_owner_admin: 'Owner',
  management: 'Manager',
  sales: 'Sales',
  inventory: 'Inventory',
  production: 'Production',
  finance_accounting: 'Finance',
  partner_investor: 'Partner',
  wholesaler: 'Wholesale',
  customer: 'Customer',
};

/** Short, plain label for a role key; falls back to the key with spaces. */
export function roleLabel(role: string): string {
  const mapped = ROLE_LABELS[role];
  if (mapped) return mapped;
  const words = role.replaceAll('_', ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}
