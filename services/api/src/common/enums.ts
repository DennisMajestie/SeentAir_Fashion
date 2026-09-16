/**
 * Core enums shared across the API.
 * Sources: docs/project/05-Role-Permission-Matrix.md, docs/project/08-Initial-Data-Model.md
 */

export enum RoleName {
  BUSINESS_OWNER_ADMIN = 'business_owner_admin',
  MANAGEMENT = 'management',
  SALES = 'sales',
  INVENTORY = 'inventory',
  PRODUCTION = 'production',
  FINANCE_ACCOUNTING = 'finance_accounting',
  PARTNER_INVESTOR = 'partner_investor',
  WHOLESALER = 'wholesaler',
  CUSTOMER = 'customer',
}

/** Access levels from the role/permission matrix: F / A / V / O / – */
export enum AccessLevel {
  NONE = 'none',
  OWN = 'own',
  VIEW = 'view',
  APPROVE = 'approve',
  FULL = 'full',
}

/** Modules as rows of the permission matrix. */
export enum ModuleName {
  MANUFACTURING = 'manufacturing',
  RAW_MATERIALS = 'raw_materials',
  CATALOGUE = 'catalogue',
  INVENTORY = 'inventory',
  RETAIL_ORDERS = 'retail_orders',
  WHOLESALE_ORDERS = 'wholesale_orders',
  CUSTOM_ORDERS = 'custom_orders',
  PAYMENTS = 'payments',
  RETURNS = 'returns',
  ACCOUNTING = 'accounting',
  LOGISTICS = 'logistics',
  MARKETING = 'marketing',
  ANALYTICS = 'analytics',
  PARTNERS = 'partners',
  STAFF_ACCESS = 'staff_access',
  APPROVALS_AUDIT = 'approvals_audit',
  COMMUNICATION = 'communication',
}

/** Actions confirmed to require approval (appendix 19). */
export enum ApprovalActionType {
  PURCHASING = 'purchasing',
  PRODUCTION_START = 'production_start',
  PRICE_CHANGE = 'price_change',
  FUND_MOVEMENT = 'fund_movement',
  STOCK_DISPOSAL = 'stock_disposal',
}

export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum UserStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

/** Ordering used to compare a user's granted level against a required level. */
export const ACCESS_RANK: Record<AccessLevel, number> = {
  [AccessLevel.NONE]: 0,
  [AccessLevel.OWN]: 1,
  [AccessLevel.VIEW]: 2,
  [AccessLevel.APPROVE]: 3,
  [AccessLevel.FULL]: 4,
};
