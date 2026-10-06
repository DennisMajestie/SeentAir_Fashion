# Components

Every component in `@seentair/ui-components`: what it is for, its inputs and
outputs, the states it has, and when not to use it. To see them rendered, run
`npm run reference` in this folder and open http://localhost:4290.

All components are standalone and imported from `@seentair/ui`. Everything is
keyboard operable and shows the system focus ring. Controls are 40px tall and
grow to 44px on a touch screen.

## Contents

- [Buttons](#buttons)
- [Form fields](#form-fields)
- [Data table](#data-table)
- [Status badge](#status-badge)
- [Cards](#cards)
- [Money](#money)
- [Feedback](#feedback): banner, toast, confirmation dialog, side drawer, empty state, skeleton
- [Navigation](#navigation): app shell, breadcrumbs, tabs
- [Charts](#charts): sparkline, line chart, bar chart
- [Icons](#icons)

---

## Buttons

`seButton` is a directive on a native `<button>` or `<a>`.

```html
<button seButton variant="primary" [loading]="saving()" (click)="save()">Save order</button>
<a seButton routerLink="/orders">View orders</a>
<button seButton variant="ghost" iconOnly aria-label="Refresh"><se-icon name="refresh" /></button>
```

| Input | Type | Default | |
|---|---|---|---|
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger'` | `'secondary'` | |
| `size` | `'md' \| 'sm'` | `'md'` | |
| `loading` | `boolean` | `false` | Shows a spinner, keeps the width, swallows clicks |
| `iconOnly` | `boolean` | `false` | Square button; **must** have an `aria-label` (logged as an error in dev if missing) |

**States:** default, hover, focus-visible, active, disabled (native `disabled`), loading (`aria-busy`).

**When not to use**
- Not for navigation inside a sentence: use a plain link.
- One `primary` per screen or dialog. If two things compete, one of them is secondary.
- `danger` is only for an action that destroys or rejects something.
- Not a `<div>` with a click handler, ever.

---

## Form fields

`<se-field>` supplies the label, hint and error; the control inside it is a
native element marked `seInput`.

```html
<se-field label="Discount" hint="Between 1 and 90 percent" [error]="discountError()">
  <input seInput type="number" [(ngModel)]="discount" />
</se-field>
```

| `se-field` input | Type | Default | |
|---|---|---|---|
| `label` | `string` | required | A real `<label>`, wired to the control |
| `hint` | `string` | `''` | Shown under the control until there is an error |
| `error` | `string \| null` | `''` | The problem, in words. Sets `aria-invalid` and is announced |
| `optional` | `boolean` | `false` | Marks the field "optional"; required is the unmarked default |
| `hideLabel` | `boolean` | `false` | Keeps the label for screen readers only (toolbars) |
| `group` | `boolean` | `false` | Renders `<fieldset>` + `<legend>` for a set of checkboxes or radios |

| Control | Markup |
|---|---|
| Text, number, date | `<input seInput>` with the native `type` |
| Select | `<select seInput>` |
| Textarea | `<textarea seInput>` |
| Checkbox | `<label class="se-choice"><input type="checkbox" /> <span>Label</span></label>` |
| Radio | the same with `type="radio"`, inside `<se-field group>` |
| Toggle | `<label class="se-choice se-choice--toggle"><input type="checkbox" role="switch" /> ...` |
| Search | `<se-search label="Search orders" [(value)]="query" />` |

`se-search` inputs: `label` (required accessible name), `placeholder`, and the two-way `value`.

**States:** default, hover, focus-visible, disabled, read-only, invalid (red border, icon and message; the message is in an `aria-live` region so it is announced, not only coloured).

**When not to use**
- A placeholder is never the label.
- A toggle is for a setting that applies immediately. Inside a form that is saved, use a checkbox.
- Do not use `seInput` alone without an `aria-label` (a bare filter in a toolbar must still have a name).

---

## Data table

`<se-table>` is the only table. Every list screen uses it.

```html
<se-table
  caption="Orders"
  [columns]="columns"
  [rows]="orders()"
  [loading]="loading()"
  [error]="error()"
  (retry)="load()"
  selectable
  [(selection)]="selected"
  [pageSize]="25"
  [actions]="rowActions"
  activatable
  (rowActivate)="open($event)"
  emptyHeading="No orders yet"
  emptyText="Orders appear here as soon as a customer checks out."
>
  <se-search seTableToolbar label="Search orders" [(value)]="query" />
  <button seButton size="sm" seTableBulk (click)="shipSelected()">Mark as shipped</button>
  <ng-template seCell="status" let-row><se-status kind="order" [value]="row.status" /></ng-template>
</se-table>
```

| Input | Type | Default | |
|---|---|---|---|
| `caption` | `string` | required | Accessible name; also used in the error message |
| `columns` | `SeColumn<T>[]` | required | See below |
| `rows` | `T[]` | required | |
| `rowId` | `(row) => string \| number` | `row.id` | Stable identity for selection |
| `loading` | `boolean` | `false` | Skeleton rows in the table's own shape |
| `error` | `string \| null` | `''` | Error state with "Try again" (`retry` output) |
| `emptyHeading`, `emptyText`, `emptyActionLabel` | `string` | | Empty state; `emptyAction` output |
| `selectable` | `boolean` | `false` | Checkbox column, select-all for the page |
| `selection` | `(string \| number)[]` | `[]` | Two-way: `[(selection)]` |
| `sort` | `SeSort \| null` | `null` | Two-way: `{ key, direction }` |
| `pageSize` | `number` | `0` | Rows per page; 0 turns paging off |
| `page` | `number` | `1` | Two-way |
| `serverSide` | `boolean` | `false` | The caller sorts and pages; pass `total` |
| `total` | `number \| null` | `null` | Total rows, with `serverSide` |
| `density` | `'comfortable' \| 'compact'` | `'comfortable'` | Two-way; toggle in the toolbar (`hideDensity` removes it) |
| `maxHeight` | CSS length | `''` | Body scrolls under a sticky header |
| `actions` | `SeRowAction<T>[]` | `[]` | Buttons at the end of each row |
| `activatable` | `boolean` | `false` | First cell becomes a button; `rowActivate` output |

`SeColumn<T>`: `key`, `header`, optional `value(row)`, `format(value, row)`, `numeric` (right-aligned, tabular figures), `sortable`, `compare(a, b)`, `width`.

`SeRowAction<T>`: `label`, optional `icon`, `run(row)`, `danger`, `disabled(row)`, `hidden(row)`.

Slots: `[seTableToolbar]` (filters, search), `[seTableBulk]` (actions shown while rows are selected), `<ng-template seCell="key">` (custom cell).

**States:** data, loading, empty, error; row hover, row selected; sorted ascending/descending/none (`aria-sort`); comfortable/compact.

**When not to use**
- Not for two or three key/value pairs: use a detail list.
- Not for page layout.
- Do not build a second table for one screen. If this one lacks something, it gains it for everyone.
- Keep row actions to two. More than that belongs on the detail page.

---

## Status badge

```html
<se-status kind="order" [value]="order.status" />
<se-status kind="payment" [value]="order.paymentStatus" />
<se-badge tone="info">Draft</se-badge>
```

`se-status` inputs: `kind` (`'order' | 'payment' | 'approval' | 'stock' | 'production' | 'return' | 'account'`) and `value` (the string the API sent). The wording and colour come from `SE_STATUS` in `src/badge/status.ts`, the single mapping for all three apps. An unknown value renders as neutral text so a new state is visible until it is mapped.

`se-badge` input: `tone` (`'neutral' | 'info' | 'success' | 'warning' | 'danger'`).

How tones are assigned: **success** = the good end state; **info** = in progress; **warning** = waiting on someone or needs attention; **danger** = failed, refused or blocked; **neutral** = closed without being either.

**When not to use**
- Do not choose a tone by hand for a domain state: use `se-status`.
- Not for counts or for a sentence.
- Colour is never the only signal: the badge always carries the word.

---

## Cards

```html
<se-metric-card label="Sales today" [value]="sales | seMoney" [change]="12.4"
  changeLabel="vs yesterday" [trend]="last14Days" trendLabel="Sales over the last 14 days" />

<se-card title="Production status">
  <button seButton size="sm" seCardActions>View all</button>
  ...body...
  <ng-container seCardFooter><button seButton variant="primary">Start batch</button></ng-container>
</se-card>
```

| `se-metric-card` input | Type | |
|---|---|---|
| `label` | `string` (required) | |
| `value` | `string \| number` (required) | Already formatted |
| `change` | `number \| null` | Percentage; null hides it |
| `changeLabel` | `string` | What it is compared with |
| `hint` | `string` | A note shown when there is no change figure |
| `goodDirection` | `'up' \| 'down'` | Default `'up'`. Use `'down'` for returns, costs, low stock |
| `trend` | `number[] \| null` | Draws a sparkline |
| `trendLabel` | `string` | The sparkline's accessible description |

`se-card` inputs: `title`, `flush` (no body padding, for a table). Slots: `[seCardActions]`, default (body), `[seCardFooter]`.

**When not to use**
- A metric card holds one number. Two numbers are two cards.
- Do not wrap every block of a page in a card, and do not nest cards.

---

## Money

```html
{{ order.totalAmount | seMoney }}      <!-- whole units -->
{{ invoice.total | seMoney: 2 }}       <!-- two decimals -->
```

The symbol and locale come from the API (`GET /config/public`) and are loaded
once at start-up: add `provideSeCurrency(API_BASE + '/config/public')` to the
app's providers. In TypeScript (a table column's `format`, a chart's
`formatValue`) use `inject(SeCurrencyService).format(amount, decimals)`.

If the configuration cannot be loaded, amounts print as plain numbers with no
symbol.

**When not to use**
- Never type a currency symbol into a template or a string. This pipe is the only place it is printed.

---

## Feedback

### Banner

```html
<se-banner tone="danger" title="Orders could not be loaded" actionLabel="Try again" (action)="reload()">
  The server did not respond. Nothing has been changed.
</se-banner>
```

Inputs: `tone` (`info | success | warning | danger`), `title`, `actionLabel`, `dismissible`. Outputs: `action`, `dismiss`. Warning and danger are `role="alert"`; info and success are `role="status"`.

**When not to use:** not to confirm something just done (toast), not for an error on one field (put it under the field).

### Toast

```ts
toast.show('Supplier saved');
toast.show('3 orders archived', { action: { label: 'Undo', run: () => this.restore() } });
toast.show('The refund could not be recorded', { tone: 'danger' });
```

`SeToastService.show(text, { tone?, duration?, action? })`. One at a time; pauses while hovered or focused.

**When not to use:** never for something that must be read or acted on. It disappears.

### Confirmation dialog

```ts
const ok = await confirm.ask({
  title: 'Delete supplier Aba Textile Mills?',
  consequence: 'The supplier is removed from the list. Past purchases keep their records. This cannot be undone.',
  confirmLabel: 'Delete supplier',
  danger: true,
});
```

`SeConfirmService.ask({ title, consequence, confirmLabel, cancelLabel?, danger? })` resolves `true` only on confirm. `consequence` is required. With `danger`, the button is red and focus starts on Cancel. A sheet from the bottom on a phone.

**When not to use:** only for destructive and approval actions. Not for routine saves, and never a bare "Are you sure?".

### Side drawer

```html
<se-drawer title="Add supplier" [(open)]="adding">
  ...fields...
  <ng-container seDrawerFooter>
    <button seButton (click)="adding.set(false)">Cancel</button>
    <button seButton variant="primary" (click)="save()">Save supplier</button>
  </ng-container>
</se-drawer>
```

Inputs: `title` (required), two-way `open`. Slots: default (body), `[seDrawerFooter]`. Focus is trapped; Escape and the backdrop close it.

**When not to use:** not for a long form (more than about six fields gets its own page), and not for a confirmation.

### Empty state

```html
<se-empty-state heading="No suppliers yet" text="Add the first supplier to start recording purchases."
  actionLabel="Add supplier" (action)="openDrawer()" />
```

Inputs: `heading` (required), `text`, `actionLabel`. Output: `action`. No illustration.

**When not to use:** not for a failed load (that is an error with a retry) and not while loading (that is a skeleton).

### Skeleton

```html
<se-skeleton shape="table" [rows]="8" [columns]="5" />
```

Inputs: `shape` (`text | title | block | table | metric | form | detail`), `rows`, `columns`. Decorative: put `aria-busy="true"` on the region that is loading.

**When not to use:** not for an action in progress (use the button's `loading`). Never a spinner on a full page.

---

## Navigation

### App shell

One per app, at the root: a collapsible sidebar, a sticky top bar and the page.

```html
<se-shell appName="Seentair admin" [nav]="nav" [user]="user()" [(collapsed)]="collapsed" (signOut)="signOut()">
  <se-search seShellSearch label="Search everything" [(value)]="query" />
  <button seButton variant="ghost" iconOnly seShellActions aria-label="Notifications"><se-icon name="bell" /></button>
  <a seShellMenu routerLink="/settings">Settings</a>
  <router-outlet />
</se-shell>
```

| Input | Type | |
|---|---|---|
| `appName` | `string` (required) | |
| `nav` | `SeNavGroup[]` (required) | `{ title?, items: SeNavItem[] }`; an item is `{ label, icon, link, badge?, exact? }` |
| `user` | `{ name, role? } \| null` | No user menu when null |
| `collapsed` | `boolean`, two-way | Sidebar shows icons only (desktop) |

Output: `signOut`. Slots: default (page, inside `<main id="se-main">`), `[seShellSearch]`, `[seShellActions]`, and `seShellMenu` on a native `<button>` or `<a>` for extra user-menu items (import `SeShellMenuItemDirective`).

**Behaviour:** the active link carries `aria-current="page"`. Below 64rem the sidebar is an off-canvas drawer opened from a menu button; it is `inert` while closed, and Escape, the scrim or choosing a link closes it. The user menu opens with Enter, Space or ArrowDown, moves with the arrow keys and closes with Escape. A "Skip to content" link is the first focusable element.

**When not to use:** not inside a page (one shell per app), not on sign-in or other screens shown before there is a session, and not in the storefront.

### Breadcrumbs

```html
<se-breadcrumbs [items]="[{ label: 'Orders', link: '/orders' }, { label: 'SO-1042' }]" />
```

Input: `items: { label, link? }[]`. The last item is always plain text with `aria-current="page"`.

**When not to use:** not on a top-level page reached straight from the sidebar, not for steps in a process, not for filters applied to a list.

### Tabs

```html
<se-tabs #t label="Order sections" [tabs]="tabs" [(active)]="tab" />
<div seTabPanel="items" [for]="t">...</div>
<div seTabPanel="payments" [for]="t">...</div>
```

`se-tabs` inputs: `tabs: { id, label, count? }[]` (required), `label` (required accessible name), two-way `active` (defaults to the first tab). `[seTabPanel]` takes the tab id and `[for]` the tabs instance; it sets the panel role, ids and visibility.

**Behaviour:** ARIA tabs with a roving tab stop: ArrowLeft/ArrowRight move and activate, Home/End jump.

**When not to use:** not for moving between pages (that is navigation), not for steps that must be done in order, not for more than about six views, and not for content people need to compare side by side.

---

## Charts

### Sparkline

```html
<se-sparkline [values]="last30Days" label="Sales over the last 30 days, rising" />
```

Inputs: `values` (required), `label` (required: what the trend is, in words).

**When not to use:** not where the reader needs values. It shows direction only and always sits beside the number it belongs to.

### Line chart

```html
<se-line-chart title="Sales, last 30 days" [labels]="days" [series]="[{ name: 'Sales', values: sales }]"
  [formatValue]="money" area />
```

| Input | Type | |
|---|---|---|
| `title` | `string` (required) | Accessible name and table caption |
| `labels` | `string[]` (required) | The x-axis categories |
| `series` | `{ name, values: (number \| null)[] }[]` (required) | `null` leaves a gap. At most five series are drawn |
| `formatValue` | `(n) => string` | Defaults to a plain number. Pass the app's money formatter |
| `area` | `boolean` | Fill under a single series; the axis then starts at zero |
| `height` | `'sm' \| 'md'` | 160px or 240px |
| `loading` | `boolean` | Skeleton of the same height |

### Bar chart

```html
<se-bar-chart title="Monthly profit" [labels]="months" [values]="profit" [formatValue]="money" />
```

Inputs: `title` (required), `labels` (required), `values: number[]` (required), `formatValue`, `height`, `loading`. One series. Negative values hang below a visible zero line.

**Both charts:** horizontal gridlines only, the same axis type and "nice" ticks (`niceTicks` in `src/chart/scale.ts`), series colours from `--se-color-chart-1..5` in order, a legend when there is more than one series. Hovering shows a guide and a tooltip; the plot is focusable and ArrowLeft/ArrowRight/Home/End move through the points. The SVG is hidden from assistive technology and a visually hidden data table carries the real values. With nothing to draw they show "No data for this period" at the same height.

**When not to use**
- Line: not for more than five series, unordered categories (use bars), or two measures on different scales (use two charts, never two axes).
- Bar: not for parts of a whole, more than one series, or more than about 24 bars.
- Neither is for looking up exact figures: that is a table.

---

## Icons

```html
<se-icon name="search" />
<se-icon name="alert" label="Warning" />
```

Inputs: `name` (one of the set in `src/icon/icon.component.ts`), `label` (set it only when the icon alone carries the meaning; otherwise the icon is hidden from assistive technology).

**When not to use:** do not add an icon font or a second icon set. If an icon is missing, add its path to the one file.
