# Seentair Limited — Full Project Documentation

This is the complete documentation set for the Seentair fashion manufacturing & commerce platform, prepared after client sign-off on 9th September 2026 (engineering revision 15 September 2026), restructured around the agreed **phase-by-phase, backend-first** delivery approach.

## Development approach

1. **Backend first** — the NestJS Core API + PostgreSQL schema are built phase by phase per `phases/`. Each phase ships tested API functionality before any UI.
2. **Frontend later, designed via Google Stitch MCP** — Angular frontends (storefront, wholesale portal, admin dashboard) follow, with UI design driven through the Stitch MCP using the brief in `project/15-Design-Specification.md`.

## How this package is organized

| Folder / file | Purpose |
|---|---|
| `phases/` | **The build plan.** One file per development phase (0–7), backend deliverables first, acceptance criteria, dependencies, frontend notes |
| `project/01-Project-Bible.md` | Single source of truth — vision, goals, principles, glossary |
| `project/02-PRD.md` | Full functional requirements, module by module |
| `project/03-Open-Questions.md` | Unresolved items to close before/during Sprint 0 |
| `project/04-Product-Architecture.md` | How modules and user-facing apps fit together |
| `project/05-Role-Permission-Matrix.md` | Who can do what |
| `project/06-UX-UI-Requirements.md` | Design principles, key flows, screen inventory |
| `project/07-Technical-Architecture.md` | Confirmed stack, system diagram, security |
| `project/08-Initial-Data-Model.md` | Entities, fields, relationships |
| `project/09-API-Specification.md` | Endpoint list by module |
| `project/10-Development-Guide.md` | Repo structure, branching, coding standards |
| `project/11-QA-Testing-Strategy.md` | Test levels, critical scenarios, UAT process |
| `project/12-Operations-Deployment-Guide.md` | Environments, CI/CD, monitoring, backups |
| `project/13-Project-Plan-Development-Phases.md` | Phase summary + dependency notes (details in `phases/`) |
| `project/14-scope.json` | Machine-readable scope summary, for tooling |
| `project/15-Design-Specification.md` | Storefront cinematic design direction + Google Stitch brief |
| `User-Manual.md` | **User manual** — how to use every delivered feature across the storefront, wholesale, admin and partner portals, plus current integration status |
| `appendix-requirements/` | The approved module-by-module client requirements (26 files) — **authoritative**: where the PRD and appendix disagree, the appendix wins |

## Suggested reading order for a new team member

1. `project/01-Project-Bible.md` — get oriented
2. `project/02-PRD.md` — understand what's being built
3. `project/08-Initial-Data-Model.md` + `project/04-Product-Architecture.md` — understand the shape of the system
4. `phases/` — understand the delivery order (start at `phase-0-foundation.md`)
5. Everything else, as needed for your role

## Important note on technical decisions

Cynthia (the client) approved the **business requirements** — what the system must do. The engineering team has confirmed the implementation stack: **Angular** for every user-interaction frontend, **Node.js + NestJS** for the backend API, and **PostgreSQL** for the central database. Hosting and certain external providers remain team/budget decisions where marked TBD. The Design Specification defines the public storefront's cinematic scroll-driven fashion direction.
