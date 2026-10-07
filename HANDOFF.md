# Handoff — where the project stands and what to do next

Last updated 2026-10-07. Read [CLAUDE.md](CLAUDE.md) first for the business
rules and non-negotiable architecture, then [README.md](README.md) for local
setup. This file covers only the current state and the next steps.

## Branches

| Branch | State |
| --- | --- |
| `main` | Production. Design system merged (PR #9); partner portal finished at `1ecd1ff`. |
| `feature/design-system` | **Merged into `main` via PR #9.** Kept for reference; no further work expected here. |

New work branches off `main`. CLAUDE.md lists the full branch model:
`main` / `develop` / `feature/*` / `hotfix/*`.

Local `.claude/worktrees/*` folders and `worktree-agent-*` branches were made by
AI agents. They are disposable and not pushed (`git worktree remove <path>` to
clean up).

## What is done

- **Backend** (`services/api`, NestJS + PostgreSQL): Phases 0–8 complete,
  including guest checkout and timed sales. See `docs/phases/`.
- **Shared design system** (`packages/ui-components`, imported as `@seentair/ui`):
  tokens, components, patterns and a reference app. Start with its
  [README](packages/ui-components/README.md), then
  [COMPONENTS.md](packages/ui-components/COMPONENTS.md) and
  [PATTERNS.md](packages/ui-components/PATTERNS.md).
  Each internal app links to it through a symlink at `src/ui ->
  ../../../packages/ui-components/src` (the apps are not npm workspaces).
- **Admin dashboard**: every screen is on the design system. Legacy styles and
  SweetAlert are gone; confirms and toasts use Seentair's own components.
- **Wholesale portal**: every screen is on the design system, each with a spec
  (123 specs passing, build clean). Checkout now goes to Paystack for the full
  amount. A cancelled or returned order can never be paid.
- **Partner portal**: every screen is on the design system, each with a spec
  (33 specs passing, build clean).
- **Storefront**: mobile redesign matches the approved references in
  `docs/design-review/stitch-approved`. It deliberately does **not** use
  `@seentair/ui`; see `docs/design-system.md`.

## What to do next, in order

1. **Check the partner and wholesale screens in a browser.** Both rebuilds pass
   their specs but have not been reviewed in a browser yet. Check light and dark
   themes and phone width.
2. **Known gaps to raise with the backend:**
   - The wholesale cart collects a delivery choice and notes, but the order
     endpoint has no fields for them, so they are not sent.
   - The wholesale initial bundle is ~594 kB, over the 500 kB budget (build
     warning only).
3. **Before go-live (outside the codebase):** production keys for Paystack,
   GIGL and Termii; answers to the High-priority Open Questions in
   `docs/project/03-Open-Questions.md` (#1 POS, #6 currency, #7 NDPR); POS
   planning.

## How to verify your work

```bash
# Per app (run inside apps/<app>; each has its own node_modules)
npx ng test --watch=false
npx ng build

# Design-system tokens: contrast and coverage rules
cd packages/ui-components && npm run check

# Backend
npm run api:dev        # from repo root; Swagger at http://localhost:3000/docs
```

Seeded dev accounts use the password `Password123!`, e.g. `partner@seentair.test`,
`wholesaler@seentair.test`, `owner@seentair.test` (full list in README).

## Conventions to keep

- Conventional Commits; one screen or one concern per commit, with the
  behaviour changes listed in the commit body.
- Components use only `--se-*` role tokens, with no hardcoded hex or one-off
  spacing. If the system lacks a value, add it in `packages/ui-components` so
  every app gets it.
- Every rebuilt screen gets a spec and proper loading, empty and error states.
- The storefront brand gold replaces the red in the approved references. Match
  their layout, not their colours.
