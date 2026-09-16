# 05. Role & Permission Matrix

Legend: **F** = Full access, **V** = View only, **A** = Can approve, **O** = Own records only, **–** = No access

| Module ↓ / Role → | Business Owner/Admin | Management | Sales | Inventory | Production | Finance/Accounting | Partner/Investor | Wholesaler | Retail Customer |
|---|---|---|---|---|---|---|---|---|---|
| Manufacturing & Production | F | V | – | V | F | V | V (summary) | – | – |
| Raw Materials | F | V | – | F | V | V | – | – | – |
| Products/Catalogue | F | F | V | V | V | – | V | V | V |
| Inventory | F | V | V | F | V | V | V (summary) | – | – |
| Retail Orders | F | V | F | V | – | V | – | – | O |
| Wholesale Orders | F | V | F | V | – | V | – | O | – |
| Custom/Pre-order | F | A | F | – | V | – | – | O | – |
| Payments | F | V | V | – | – | F | V (summary) | O | O |
| Returns | F | A | F | V | – | V | – | O | O |
| Accounting/Finance | F | V | – | – | – | F | V (permitted reports) | – | – |
| Logistics | F | V | V | V | – | – | – | O | O (own delivery) |
| Marketing | F | F | V | – | – | – | – | – | – |
| Analytics/Dashboard | F | F | V (own area) | V (own area) | V (own area) | V (own area) | V (permitted) | – | – |
| Partners/Investors module | F | V | – | – | – | V | O | – | – |
| Staff & Access Control | F | V | – | – | – | – | – | – | – |
| Approvals & Audit Trail | F | A | – | – | – | A (finance items) | – | – | – |
| Communication tools | F | V | F (customer msgs) | – | – | – | – | O | O |

## Rules to enforce in the permission system

- **Approval gating:** purchasing, production starts, price changes, and fund transfers require an explicit approval action from Management or Business Owner/Admin — regular staff cannot self-approve.
- **No silent overrides:** any action affecting inventory or funds must write to the audit trail regardless of role.
- **Partner/Investor isolation:** this role must never have access to the retail/wholesale customer-facing interfaces or raw customer PII — client was explicit about this boundary.
- **Least privilege by default:** new roles/staff accounts start with View-only access to a module until explicitly granted Full access.

## Open item

Exact approval chain (who approves what — Manager vs Business Owner/Admin) for each action type should be confirmed against `../appendix-requirements/19-Approvals-Audit-Trail.md` during technical design; the table above is a reasonable default based on confirmed requirements, not a client-specified matrix.
