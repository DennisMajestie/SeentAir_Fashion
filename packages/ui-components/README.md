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

Components and patterns are added in later phases.

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

Tokens are loaded by listing the stylesheet ahead of the app's own in
`angular.json`, for both the `build` and `test` targets:

```json
"styles": ["../../packages/ui-components/src/tokens/tokens.css", "src/styles.scss"]
```

Angular components from this package (later phases) are imported through a path
alias in the app's `tsconfig.json`. The apps are not npm workspaces and each
has its own `node_modules`, so Angular itself must be mapped to the app's copy
or the package's files cannot resolve it:

```json
"paths": {
  "@seentair/ui": ["../../packages/ui-components/src/index.ts"],
  "@angular/*": ["./node_modules/@angular/*"],
  "rxjs": ["./node_modules/rxjs"],
  "rxjs/*": ["./node_modules/rxjs/*"],
  "tslib": ["./node_modules/tslib"]
}
```

Deployment note: each app builds from its own folder (`apps/<app>`), and this
package sits outside it. On Vercel the project must be allowed to read files
outside its root directory, or the build will not find the stylesheet.
