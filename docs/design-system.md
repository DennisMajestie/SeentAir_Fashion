# SEENTAIR Design System

Canonical source of truth for all four frontends. When this doc and a
component disagree, the doc wins. Tokens are **mirrored** (never shared via a
package) into each app's global `styles.scss` `:root` so each app builds and
deploys standalone. Source brief: `docs/project/15-Design-Specification.md` §15.5.

## Two systems, one language

| Surface            | Customer (storefront)                    | Ops (wholesale / admin / partner)        |
| ------------------ | ---------------------------------------- | ---------------------------------------- |
| Accent             | **Rust**                                 | **Gold**                                 |
| Light mode         | `#b32d00` on cream `#faf7f2`             | `#b8862f` gold on `#faf7f2`              |
| Dark mode          | `#ff6a3d` on near-black `#141311`        | `#c9a24a` on near-black `#0f0e0c`        |
| Display type       | Oswald 600/700 uppercase, lh 0.92–1      | Inter 600/700 uppercase                  |
| Body type          | Inter 400–600                            | Inter 400–600                            |

Exemption: the storefront scroll-dressing hero is a frozen, approved asset. It
keeps gold-on-ivory in **both** themes (scoped `.hero-*` token override in
`storefront/src/styles.scss`). Do not redesign it.

## Color tokens

Surfaces per app (light `:root` / dark `:root[data-theme='dark']`):

**Storefront** — `--canvas --card --container --container-2 --line --line-2
--ink --muted --primary --primary-fill --primary-tint --on-primary --ok --warn
--danger`

**Ops (token names kept for template compatibility)** — wholesale:
`--surface --surface-bright --surface-lowest --surface-low --surface-container
--surface-high --surface-highest --surface-dim --ink --ink-variant --muted
--muted-faint --gold --gold-strong --gold-ink --primary --primary-container
--primary-action --primary-action-hover --on-primary --primary-fixed
--primary-soft --error --on-error --error-container --on-error-container --ok
--hairline --hairline-strong`. Admin/partner keep the legacy names:
`--obsidian --panel --panel-2 --hairline --hairline-2 --hairline-strong --ink
--ink-dim --gold --gold-strong --acid --acid-ink --on-acid --danger --ok`.

Rules: never hardcode a hex in a component; status colors are role-tokenized
(`--ok --warn --danger`); any new surface maps to an existing token name.

## Type scale

- Customer labels: 11–12px, uppercase, `letter-spacing: 0.14em`, weight 700.
- Body: 13–15px Inter, line-height 1.5–1.6.
- Display: Oswald 700 uppercase, line-height 0.92–1, clamped with `vw`.
- Ops labels: `--type-label-sm/md/lg`, data `--type-data` (tabular numerals).

## Spacing, radius, motion

- Spacing: 8px scale — 8 / 16 / 24 / 40 / 64 (storefront
  `--space-4/8/12/16/24/32/40/48/64`; ops `--space-xs/sm/md/lg/xl`).
- Radius: 12px fields, 16–24px cards, 999px pills; customer surfaces use it,
  ops surfaces may stay squared (`--radius-field: 0`) except pills.
- Motion: entrance = opacity + 12px translateY, staggered ~80ms, wrapped in
  `prefers-reduced-motion: reduce` (`@keyframes u-rise` + `.u-rise-1..5`).
  Skeleton shimmer and spinners also disable/harmless under reduced motion.

## Components (approved spec)

- **Button `.cta`** — pill, 44px min-height, uppercase 12px, `:focus-visible`
  2px accent ring, `.ghost`/`.outline` and `.small` variants, `:disabled`
  opacity + `cursor: default`; in-flight = `.spinner` + `.btn-loading` inside
  the disabled button.
- **Input** — customer: 52px, radius 12, accent focus ring
  (`box-shadow: 0 0 0 3px var(--primary-tint)`), `aria-invalid` →
  danger border, inline `.field-error`, optional `.input-affix` + trailing
  `.affix-btn`. Ops: squared, 1px border, same focus discipline.
- **Card `.matrix-panel` / `.panel`** — bordered surface, sticky where used;
  focal number is the **gradient total** (135° accent fill → accent mix).
- **Notice `.notice`** — role-toned (`notice-warn` amber, `notice-error`,
  `notice-success`, `notice-accent`); renders only when the condition is true
  (e.g. wholesale MOQ met, made-to-order items, real errors).
- **StageBar `.stage-bar`** — label line (real stage name + "Step n of 3") +
  segmented progress; segments fill to the current step.
- **Sticky CTA `.sticky-cta`** — stick bottom, `env(safe-area-inset-bottom)`
  padding, translucent canvas + blur, trust line + primary action.
- **Badge / Chip / Pill** — pill shape, fill = `--primary(-fill)` with
  `--on-primary` text; `.active` state; 40px+ tap targets.
- **ThemeToggle `.theme-toggle`** — 44px pill, sun/moon SVG, `aria-label`
  announces the action.

## Behavior & non-negotiables

- Breakpoints: 375 / 768 / 1440; mobile-first.
- Touch: 44px min tap target (44px for primary, 40px allowed for dense ops
  controls).
- Focus: visible 2px accent ring on every interactive element via `:focus-visible`.
- Safe area: sticky header `padding-top: env(safe-area-inset-top)`; sticky
  footer `env(safe-area-inset-bottom)`; widest views use
  `max(env(safe-area-inset-*), var(--wrap-x))`.
- No new dependencies without approval. Never touch photography/imagery.

## Theming plumbing (this is the "single source" for theme)

Key: `localStorage['seentair.theme']` = `'light' | 'dark'`, shared across all
four apps. Resolution order: saved → `prefers-color-scheme`.

1. `index.html` pre-paint script sets `data-theme` + `color-scheme` before
   Angular boots (no light-flash).
2. `theme.service.ts` (identical per app, different `theme-color` meta values)
   owns the toggle, persists, and syncs the `<meta name="theme-color">`.
3. CSS: light tokens in `:root`, dark overrides in `:root[data-theme='dark']`.

## App plumbing map

| File | Responsibility |
| --- | --- |
| `storefront/src/styles.scss` | rust tokens, type/spacing/radius/motion, hero exemption, `.notice .stage-bar .sticky-cta .skeleton` |
| `storefront/src/app/{theme,cart}.service.ts` | theme toggle; cart MOQ/made-to-order signals |
| `storefront/src/…/pages/{cart,checkout,order}.page.ts` | approved Cart & Checkout spec; manifest thumbnails; legacy `--acid`/`Anton` removed |
| `wholesale-portal/src/styles.scss` | gold tokens + dark, `$ops-*`-free login |
| `admin-dashboard/src/styles.scss` | `$ops-*` SCSS vars now map to CSS tokens; login shell theme-aware |
| `partner-portal/src/styles.scss` | gold tokens + dark; `main` now honors `--wrap-x` |
| All `index.html` | pre-paint script, `viewport-fit=cover`, `color-scheme`, theme-color |

## Phase 2 (rollout)

Per-screen: swap inline/literal styles to tokens, add proper states
(loading/empty/error), 44px targets, dark-mode pass, safe-area on sticky
elements. One screen per commit chunk; re-check against this doc after each; report between phases.