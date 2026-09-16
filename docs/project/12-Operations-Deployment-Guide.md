# 12. Operations & Deployment Guide

Proposed defaults — confirm hosting provider and budget with client/team before committing.

## Environments

| Environment | Purpose | Data |
|---|---|---|
| Development | Local/engineer machines | Synthetic seed data |
| Staging | Pre-production testing, UAT with client | Synthetic/anonymized data, Paystack sandbox |
| Production | Live system | Real data, Paystack live keys |

## CI/CD (proposed)

- On pull request: lint, type-check, unit + integration tests.
- On merge to `develop`: auto-deploy to Staging.
- On merge to `main` (via release PR from `develop`): auto-deploy to Production after manual approval gate.

## Monitoring & alerting

- Application error tracking (e.g. Sentry or similar).
- Uptime monitoring on the Core API and all customer-facing storefronts.
- Alert the team on: payment webhook failures (Paystack), failed inventory movement writes, and any spike in approval-request rejections (may indicate a permissions bug).

## Backups

- Daily automated database backups, retained on a rolling window (e.g. 30 days), with at least weekly backups retained longer-term.
- Backup restore should be tested periodically, not just taken on faith.

## Logging

Centralized application logs, retained long enough to support the audit-trail requirement (`../appendix-requirements/19-Approvals-Audit-Trail.md`) — the audit log itself lives in the database as a first-class record, separate from ephemeral application logs.

## Incident response (outline)

1. Detect (monitoring alert or user report).
2. Triage severity — payment or inventory-affecting incidents are highest priority given the client's explicit emphasis on correctness in these areas.
3. Communicate status to the client if customer-facing.
4. Fix, deploy, and add a regression test per `11-QA-Testing-Strategy.md`.
5. Brief post-incident note in the project log.

## Data protection

Pending Open Question #7 (NDPR compliance) — until confirmed, default to conservative practice: encrypt PII at rest, log all access to customer records, and avoid exporting raw customer data outside the production environment.
