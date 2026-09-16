/**
 * Shared contracts between the NestJS API and the Angular frontends.
 * Mirrors services/api/src/common/enums.ts — keep in sync (single source
 * to be extracted here fully once the first frontend lands).
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

export enum AccessLevel {
  NONE = 'none',
  OWN = 'own',
  VIEW = 'view',
  APPROVE = 'approve',
  FULL = 'full',
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
}
