# @seentair/ui-components

The shared design system for Seentair's three internal apps: the admin
dashboard, the wholesale portal and the partner portal.

**The retail storefront does not use this package.** It has its own editorial
treatment and the design specification requires it to stay visually distinct
from the internal apps. Do not load these tokens or components there.

## What is here

| Path | What it is |
|---|---|
| `src/tokens/tokens.css` | The token layer: every colour, type role, spacing step, radius, border width, elevation and motion value, as CSS custom properties prefixed `--se-`. Light by default, dark under `<html data-theme="dark">`. |
| `src/tokens/reference.html` | One page showing every token rendered. Open it in a browser. It reads its values live from `tokens.css` and measures contrast on the page. |
| `scripts/check-tokens.mjs` | The rules, enforced: contrast for every allowed text/surface pairing in both themes, lightness separation between status colours, and that every token appears on the reference page. |

| `src/styles/` | Component styles, one file per component, tokens only. `index.css` is the whole system as one stylesheet. |
| `src/<component>/` | Angular components and directives (standalone, `se-` prefix), each with its spec. |
| `reference/` | The component reference app. |
| `COMPONENTS.md` | Every component: inputs, states and when not to use it. |
| `PATTERNS.md` | How screens are put together: page template, filtering, create and edit, confirmations, detail pages, loading, errors. |

## Rules

1. **Roles, not primitives.** Components use `--se-color-*` role tokens. The
   `--se-neutral-*` ramp exists to define the roles and is never used directly.
2. **No values outside the system.** Spacing comes from `--se-space-*`, type
   from the seven `--se-type-*` roles, radius from `--se-radius-*`. If a design
   needs a value that is not here, the system changes, in this file, for
   everyone -- a one-off value in an app is how the three apps drifted apart.
3. **Numbers in columns use `.se-num`** (tabular figures, right-aligned).
4. **Change a colour, run the check.** `npm run check` in this folder. A colour
   that fails contrast does not ship.

## How an app consumes it

The apps are not npm workspaces: each has its own `node_modules`. Source files
in this package therefore cannot resolve Angular on their own, and mapping
`@angular/*` with tsconfig `paths` does not work either (it bypasses package
`exports`, so `@angular/core/testing` and friends fail, and the dev server ends
up with two copies of Angular). The package is instead **symlinked into the
app**, so its files resolve everything from that app like any other source file:

```
apps/<app>/src/ui  ->  ../../../packages/ui-components/src
```

with, in the app:

- `tsconfig.json`: `"preserveSymlinks": true` and
  `"paths": { "@seentair/ui": ["./src/ui/index.ts"] }`
- `angular.json` (build and test options): `"preserveSymlinks": true`, and the
  stylesheet listed ahead of the app's own:
  `"styles": ["src/ui/styles/index.css", "src/styles.scss"]`

Then `import { SeButtonDirective } from '@seentair/ui'`.

Git stores the symlink, so a fresh clone has it. On Windows, symlinks need
`git config core.symlinks true` and developer mode.

Deployment note: each app builds from its own folder (`apps/<app>`) and the
link points outside it. On Vercel the project must be allowed to read files
outside its root directory, or the build will not find the package.

## Reference app and tests

The reference app (`reference/`) and the component specs (`src/**/*.spec.ts`)
are built with the admin dashboard's toolchain, as a second project in its
`angular.json`:

```
npm test              # the token rules (self-contained; runs in CI)
npm run check         # the token rules, on their own
npm run reference     # http://localhost:4290, every component in its states
npm run test:reference   # the component specs, headless
```

`test:reference` reaches into `apps/admin-dashboard`, which is not an npm
workspace and has its own `node_modules`. Run `npm ci` in `apps/admin-dashboard`
first, and only on a machine with the Angular toolchain — it is not part of the
root `npm test` or CI.
