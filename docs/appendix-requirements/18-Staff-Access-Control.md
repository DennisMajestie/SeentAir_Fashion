# 18. Staff & Access Control

## Scale

Approximately **10 people** are expected to use the internal system.

## Principle

Not everyone should have access to everything — the system must support **roles and permissions**.

## Confirmed roles (illustrative, not necessarily exhaustive)

- Business Owner/Admin
- Sales
- Inventory
- Production
- Finance/Accounting
- Management
- Partner/Investor
- Customer

## Requirement

Sensitive activities should be restricted by role, and important actions should be recorded (see `19-Approvals-Audit-Trail.md`).

## Data/entities implied

- `User` (name, role, permissions)
- `Role` (name, list of permitted actions)
