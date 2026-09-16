import { AccessLevel, ModuleName, RoleName } from '../../common/enums';

const { FULL, VIEW, APPROVE, OWN, NONE } = AccessLevel;

/**
 * Seed data transcribed from docs/project/05-Role-Permission-Matrix.md.
 * A reasonable default per the doc — not a client-specified matrix; exact
 * approval chains to be confirmed during technical design (open item).
 * NONE rows are omitted (least privilege: missing row = no access).
 */
export const PERMISSION_MATRIX: Record<RoleName, Partial<Record<ModuleName, AccessLevel>>> = {
  [RoleName.BUSINESS_OWNER_ADMIN]: Object.fromEntries(
    Object.values(ModuleName).map((m) => [m, FULL]),
  ) as Record<ModuleName, AccessLevel>,

  [RoleName.MANAGEMENT]: {
    [ModuleName.MANUFACTURING]: VIEW,
    [ModuleName.RAW_MATERIALS]: VIEW,
    [ModuleName.CATALOGUE]: FULL,
    [ModuleName.INVENTORY]: VIEW,
    [ModuleName.RETAIL_ORDERS]: VIEW,
    [ModuleName.WHOLESALE_ORDERS]: VIEW,
    [ModuleName.CUSTOM_ORDERS]: APPROVE,
    [ModuleName.PAYMENTS]: VIEW,
    [ModuleName.RETURNS]: APPROVE,
    [ModuleName.ACCOUNTING]: VIEW,
    [ModuleName.LOGISTICS]: VIEW,
    [ModuleName.MARKETING]: FULL,
    [ModuleName.ANALYTICS]: FULL,
    [ModuleName.PARTNERS]: VIEW,
    [ModuleName.STAFF_ACCESS]: VIEW,
    [ModuleName.APPROVALS_AUDIT]: APPROVE,
    [ModuleName.COMMUNICATION]: VIEW,
  },

  [RoleName.SALES]: {
    [ModuleName.CATALOGUE]: VIEW,
    [ModuleName.INVENTORY]: VIEW,
    [ModuleName.RETAIL_ORDERS]: FULL,
    [ModuleName.WHOLESALE_ORDERS]: FULL,
    [ModuleName.CUSTOM_ORDERS]: FULL,
    [ModuleName.PAYMENTS]: VIEW,
    [ModuleName.RETURNS]: FULL,
    [ModuleName.LOGISTICS]: VIEW,
    [ModuleName.MARKETING]: VIEW,
    [ModuleName.ANALYTICS]: VIEW,
    [ModuleName.COMMUNICATION]: FULL,
  },

  [RoleName.INVENTORY]: {
    [ModuleName.MANUFACTURING]: VIEW,
    [ModuleName.RAW_MATERIALS]: FULL,
    [ModuleName.CATALOGUE]: VIEW,
    [ModuleName.INVENTORY]: FULL,
    [ModuleName.RETAIL_ORDERS]: VIEW,
    [ModuleName.WHOLESALE_ORDERS]: VIEW,
    [ModuleName.RETURNS]: VIEW,
    [ModuleName.LOGISTICS]: VIEW,
    [ModuleName.ANALYTICS]: VIEW,
  },

  [RoleName.PRODUCTION]: {
    [ModuleName.MANUFACTURING]: FULL,
    [ModuleName.RAW_MATERIALS]: VIEW,
    [ModuleName.CATALOGUE]: VIEW,
    [ModuleName.INVENTORY]: VIEW,
    [ModuleName.CUSTOM_ORDERS]: VIEW,
    [ModuleName.ANALYTICS]: VIEW,
  },

  [RoleName.FINANCE_ACCOUNTING]: {
    [ModuleName.MANUFACTURING]: VIEW,
    [ModuleName.RAW_MATERIALS]: VIEW,
    [ModuleName.INVENTORY]: VIEW,
    [ModuleName.RETAIL_ORDERS]: VIEW,
    [ModuleName.WHOLESALE_ORDERS]: VIEW,
    [ModuleName.PAYMENTS]: FULL,
    [ModuleName.RETURNS]: VIEW,
    [ModuleName.ACCOUNTING]: FULL,
    [ModuleName.ANALYTICS]: VIEW,
    [ModuleName.PARTNERS]: VIEW,
    [ModuleName.APPROVALS_AUDIT]: APPROVE,
  },

  // Partner/Investor: summaries and permitted reports only — never
  // customer-facing modules or raw customer PII (client-explicit boundary).
  [RoleName.PARTNER_INVESTOR]: {
    [ModuleName.MANUFACTURING]: VIEW,
    [ModuleName.CATALOGUE]: VIEW,
    [ModuleName.INVENTORY]: VIEW,
    [ModuleName.PAYMENTS]: VIEW,
    [ModuleName.ACCOUNTING]: VIEW,
    [ModuleName.ANALYTICS]: VIEW,
    [ModuleName.PARTNERS]: OWN,
  },

  [RoleName.WHOLESALER]: {
    [ModuleName.CATALOGUE]: VIEW,
    [ModuleName.WHOLESALE_ORDERS]: OWN,
    [ModuleName.CUSTOM_ORDERS]: OWN,
    [ModuleName.PAYMENTS]: OWN,
    [ModuleName.RETURNS]: OWN,
    [ModuleName.LOGISTICS]: OWN,
    [ModuleName.COMMUNICATION]: OWN,
  },

  [RoleName.CUSTOMER]: {
    [ModuleName.CATALOGUE]: VIEW,
    [ModuleName.RETAIL_ORDERS]: OWN,
    [ModuleName.PAYMENTS]: OWN,
    [ModuleName.RETURNS]: OWN,
    [ModuleName.LOGISTICS]: OWN,
    [ModuleName.COMMUNICATION]: OWN,
  },
};

// Referenced so the import of NONE is intentional even though omitted rows encode it.
void NONE;
