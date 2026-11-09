export type PermissionGroupId =
  | 'sales_customers'
  | 'products_stock'
  | 'production_materials'
  | 'finance_reporting'
  | 'admin_security'
  | 'other';

export interface PermissionModuleConfig {
  label: string;
  description: string;
  group: Exclude<PermissionGroupId, 'other'>;
  ownSupported: boolean;
  approveSupported: boolean;
}

export interface PermissionRoleConfig {
  label: string;
  initials: string;
  description: string;
  group: 'staff' | 'external';
  readOnly: boolean;
}

export const PERMISSION_ROLES: Record<string, PermissionRoleConfig> = {
  business_owner_admin: {
    label: 'Business owner', initials: 'BO', description: 'Full oversight of the business.', group: 'staff', readOnly: true,
  },
  management: {
    label: 'Management', initials: 'M', description: 'Manage day-to-day operations and approvals.', group: 'staff', readOnly: false,
  },
  sales: {
    label: 'Sales', initials: 'S', description: 'Handle customer sales and order workflows.', group: 'staff', readOnly: false,
  },
  inventory: {
    label: 'Inventory', initials: 'I', description: 'Manage stock, materials, and warehouse work.', group: 'staff', readOnly: false,
  },
  production: {
    label: 'Production', initials: 'P', description: 'Manage production batches and quality workflows.', group: 'staff', readOnly: false,
  },
  finance_accounting: {
    label: 'Finance & accounting', initials: 'FA', description: 'Manage payments, ledgers, and financial reporting.', group: 'staff', readOnly: false,
  },
  partner_investor: {
    label: 'Partner / investor', initials: 'PI', description: 'View permitted partner and investment information.', group: 'external', readOnly: true,
  },
  wholesaler: {
    label: 'Wholesaler', initials: 'W', description: 'Place and manage wholesale orders.', group: 'external', readOnly: true,
  },
  customer: {
    label: 'Customer', initials: 'C', description: 'Place and manage retail orders.', group: 'external', readOnly: true,
  },
};

export const PERMISSION_GROUPS: Array<{ id: Exclude<PermissionGroupId, 'other'>; label: string }> = [
  { id: 'sales_customers', label: 'Sales and customers' },
  { id: 'products_stock', label: 'Products and stock' },
  { id: 'production_materials', label: 'Production and materials' },
  { id: 'finance_reporting', label: 'Finance and reporting' },
  { id: 'admin_security', label: 'Admin and security' },
];

export const PERMISSION_MODULES: Record<string, PermissionModuleConfig> = {
  retail_orders: {
    label: 'Online orders', description: 'Retail order records, payment, fulfillment, and tracking.', group: 'sales_customers', ownSupported: true, approveSupported: false,
  },
  wholesale_orders: {
    label: 'Wholesale orders', description: 'Wholesale orders, accounts, and buyer pricing.', group: 'sales_customers', ownSupported: true, approveSupported: false,
  },
  custom_orders: {
    label: 'Custom orders', description: 'Custom requests, quotations, samples, and order status.', group: 'sales_customers', ownSupported: true, approveSupported: true,
  },
  payments: {
    label: 'Payments', description: 'Payment records and payment-related order actions.', group: 'sales_customers', ownSupported: false, approveSupported: false,
  },
  returns: {
    label: 'Returns', description: 'Customer return requests, resolutions, refunds, and restocking.', group: 'sales_customers', ownSupported: true, approveSupported: false,
  },
  marketing: {
    label: 'Marketing and coupons', description: 'Campaigns, coupons, bundles, and campaign reporting.', group: 'sales_customers', ownSupported: false, approveSupported: false,
  },
  communication: {
    label: 'Messages and notifications', description: 'Support tickets, customer messages, and notifications.', group: 'sales_customers', ownSupported: false, approveSupported: false,
  },
  catalogue: {
    label: 'Products and catalogue', description: 'Products, variants, collections, categories, and specifications.', group: 'products_stock', ownSupported: false, approveSupported: true,
  },
  inventory: {
    label: 'Stock and inventory', description: 'Stock movements, counts, balances, and inventory valuation.', group: 'products_stock', ownSupported: false, approveSupported: false,
  },
  logistics: {
    label: 'Delivery and logistics', description: 'Delivery records, tracking, checkpoints, and shipping rates.', group: 'products_stock', ownSupported: true, approveSupported: false,
  },
  manufacturing: {
    label: 'Production', description: 'Production batches, stage changes, costs, scans, and quality checks.', group: 'production_materials', ownSupported: false, approveSupported: false,
  },
  raw_materials: {
    label: 'Materials and suppliers', description: 'Materials, suppliers, purchases, valuation, and usage.', group: 'production_materials', ownSupported: false, approveSupported: false,
  },
  accounting: {
    label: 'Accounting', description: 'Accounting ledger entries and financial reports.', group: 'finance_reporting', ownSupported: false, approveSupported: false,
  },
  analytics: {
    label: 'Analytics and reports', description: 'Dashboard metrics, best sellers, stock alerts, and trends.', group: 'finance_reporting', ownSupported: false, approveSupported: false,
  },
  partners: {
    label: 'Partners and investors', description: 'Partner records, dashboards, and profit distributions.', group: 'finance_reporting', ownSupported: true, approveSupported: false,
  },
  staff_access: {
    label: 'Team and roles', description: 'Staff accounts, role assignments, and permission levels.', group: 'admin_security', ownSupported: false, approveSupported: false,
  },
  approvals_audit: {
    label: 'Approvals and audit log', description: 'Approval requests, decisions, audit records, and verification.', group: 'admin_security', ownSupported: false, approveSupported: true,
  },
};

export const HIGH_IMPACT_MODULES = new Set([
  'accounting',
  'staff_access',
  'approvals_audit',
  'payments',
  'partners',
]);

export function humanizePermissionKey(key: string): string {
  return key
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
