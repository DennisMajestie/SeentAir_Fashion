# 19. Approvals & Audit Trail

## Requirement

Some important actions must require **management approval** before they take effect, and the system must keep a history of:
- Who performed an action
- What was changed
- When it was changed
- What was approved/rejected (where applicable)

## Actions confirmed to require approval/authorization

- Purchasing
- Production
- Changing of product price
- Moving of funds
- Any employee action to manufacture, alter, remove, transfer, give away, or dispose of materials or finished products **without authorization** (this is a strict policy — the system should make unauthorized versions of these actions impossible, not just logged)

## Data/entities implied

- `ApprovalRequest` (action_type, requested_by, status, approved_by, decided_at)
- `AuditLogEntry` (actor, action, before_state, after_state, timestamp)
