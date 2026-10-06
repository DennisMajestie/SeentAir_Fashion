# Patterns

Components make screens look alike. Patterns make them **work** alike: the same
thing is in the same place, behaves the same way and is worded the same way in
the admin dashboard, the wholesale portal and the partner portal.

Each pattern below is a set of rules, the reason for them, and the components
that implement them. Two worked screens (a list and a detail page) are in the
reference app under "Patterns" (`npm run reference`).

If a screen needs to break a pattern, the pattern is wrong or the screen is.
Change it here, for everyone.

## Contents

1. [Page template](#1-page-template)
2. [Filtering](#2-filtering)
3. [Create and edit](#3-create-and-edit)
4. [Destructive and approval actions](#4-destructive-and-approval-actions)
5. [Detail pages](#5-detail-pages)
6. [Loading](#6-loading)
7. [Errors](#7-errors)
8. [Formatting data](#8-formatting-data)
9. [Navigation and roles](#9-navigation-and-roles)

---

## 1. Page template

Every screen is an `<se-page>` inside the app's one `<se-shell>`.

**The order, top to bottom, never rearranged**

1. **Breadcrumb**, only on pages below the top level. A page reached straight from the sidebar has none: the sidebar already says where you are.
2. **Title** on the left, as the page's single `<h1>`. On a detail page the record's **status badge** sits directly beside it.
3. **Actions** on the right of the title. At most one primary button, and it is the last one, at the edge. At most two secondary buttons beside it. Anything further goes on the detail page or in a row.
4. **One line of description or metadata** under the title, if the title alone is not enough.
5. **Tabs**, if the page has more than one view of the same thing.
6. **Filters**, directly above what they filter.
7. **Content**.

**Rules**

- The title is a noun for a list ("Orders") and the record's own name or reference for a detail page ("Order SE-48210"). Never "Manage orders", never "Orders list".
- The primary action is a verb and a noun: "Add supplier", "Start batch". Never "New", "Create" or "Submit" alone.
- Lists run the full width. Forms and settings use `width="narrow"`: a form stretched across a wide monitor is harder to read, not easier.
- On a phone the actions drop under the title at full width. Nothing else moves.
- Dense, not cramped: the page has 24px of padding and 16px between blocks (`--se-space-6`, `--se-space-4`). Do not add spacing to "let it breathe" until the data is pushed below the fold.

**Components:** `se-shell`, `se-page`, `se-breadcrumbs`, `se-tabs`.

---

## 2. Filtering

Every list filters the same way, with `<se-filter-bar>`.

**Position:** inside the table's toolbar (`seTableToolbar`), so the filters are attached to the rows they affect. For a list that is not a table, in the page's `[sePageFilters]` slot. Nowhere else: not in a sidebar, not in a dialog, not in the page header.

**Order inside the bar:** search first, then the filters as selects, then the result count.

**Rules**

- **Each filter is a select whose first option means "no filter"**, worded "Any status", "Any category".
- **What is applied is always visible** as chips under the controls: "Status: Active ✕". The search term is a chip too. A filter the user cannot see is a list they cannot trust.
- **Each chip removes its own filter. "Clear all" removes every filter and the search**, in one action, and is only present when something is applied.
- **The count updates as filters change**: "3 suppliers". It is the quickest confirmation that the filter did something.
- **Filters apply immediately.** There is no "Apply" button on a desktop list.
- **Filters live in the URL** (query parameters), so a filtered list survives a reload and can be shared or bookmarked. Sorting and the page number go there too.
- **No more than three filters in the bar.** If a list needs more, the fourth and beyond go behind a "More filters" drawer that follows the create/edit pattern, and still produce chips.
- **A filter that matches nothing shows the table's empty state** with the heading "No suppliers match these filters" and the action "Clear all filters". It is not the same message as a list that has never had anything in it.
- While rows are selected, the toolbar shows the selection and its bulk actions in place of the filters. Clearing the selection brings the filters back.

**Components:** `se-filter-bar`, `se-table` (toolbar slot, empty state), `se-search`.

---

## 3. Create and edit

**Drawer or page: one rule**

Use a **side drawer** when all of these are true:

- six fields or fewer,
- one section, no line items, no file uploads,
- the person does not need to look anything else up to fill it in.

Otherwise use a **full page** (`<se-page width="narrow">`). Edit always uses the same surface as create for that record. A form never opens in a centred dialog.

The drawer keeps the list in place behind it, which is why it suits quick additions. A long form in a drawer becomes a cramped scroll, which is why it stops at six fields.

**Layout**

- One column of fields. Two fields share a row only when they are read as a pair (city and state, start and end date): `.se-form__row`.
- Required is the default and is not marked. Optional fields are marked "optional". Asterisks are not used.
- Every field has a label above it. A hint goes under the field when the format is not obvious. Placeholders are examples, never instructions.

**Save and cancel: the same place everywhere**

- **At the end of the form, on the right: Cancel, then the primary action.** In a drawer that is the footer; on a page it is `.se-form__actions--sticky`, pinned to the bottom so it is reachable from any scroll position.
- The primary action is a verb and a noun, "Save supplier", and it is the only primary button on the surface.
- Cancel is a secondary button, never a link, never an ✕ alone.
- On a phone both are full width and the primary action is on top.
- There is no "Reset" button.

**Behaviour**

- Pressing the primary action puts the button into its loading state. It cannot be pressed twice.
- **Validation** runs when the form is submitted, then field by field as each is corrected. It does not fire while someone is still typing their first attempt.
- **On success:** the drawer closes (or the page returns to the record), and a toast confirms it: "Aba Textile Mills saved".
- **On failure the person can fix:** the message goes under the field (pattern 7) and focus moves to the first field with a problem.
- **On failure they cannot fix** (server, network): a danger banner at the top of the form with "Try again". Everything they typed stays exactly as it was.
- **Leaving with unsaved changes** asks first, using the confirmation dialog: "Discard your changes to this supplier?" / "What you typed will be lost." / "Discard changes".

**Components:** `se-drawer`, `se-page`, `se-field`, `seInput`, `.se-form`, `.se-form__row`, `.se-form__actions`, `se-banner`, `SeToastService`.

---

## 4. Destructive and approval actions

Every action that destroys something, cannot be undone, moves money or stock, or records a decision goes through one dialog: `SeConfirmService`.

**The dialog always has three parts**

| Part | Rule | Example |
|---|---|---|
| Title | The action and the thing, as a question | "Delete supplier Aba Textile Mills?" |
| Consequence | What will happen, to what and to whom, and whether it can be undone. Mandatory. | "The supplier is removed from the list. Past purchases keep their records. This cannot be undone." |
| Confirm button | The same verb as the title | "Delete supplier" |

**Rules**

- **Never "Are you sure?"** and never "OK" / "Yes". A dialog that does not say what will happen gives no reason to stop.
- **Name the consequence that matters to this business.** For anything approval-gated or audited, say so: "Your approval is written to the audit log and cannot be withdrawn." For stock: "12 units are written off and removed from stock."
- **Destructive, rejecting or irreversible:** `danger: true`. The button is red and focus starts on Cancel, so Enter does not confirm by accident.
- **Approving** is a primary button, not a danger one. It is consequential, not destructive.
- **A decision that needs a reason** (rejecting a request, cancelling an order, writing off stock) uses `askWithReason`. The reason is required, is labelled for what it is ("Reason for rejection"), and the dialog says where the reason will go.
- **If it can be undone, do not ask.** Do it, and offer "Undo" in the toast. Confirmation is for what cannot be taken back.
- **After the action:** a toast confirms it ("Request rejected"), the status badge changes, and the event appears at the top of the record's activity history.
- **The dialog never contains a form** beyond the single reason field. More input than that is a drawer.
- Whether the action is *allowed* is decided by the API (approval gating and roles are server-side). The dialog confirms intent; it is not the permission check. A person who may not do something is not shown the button (pattern 9).

**Components:** `SeConfirmService.ask`, `SeConfirmService.askWithReason`, `SeToastService`, `se-status`, `se-activity`.

---

## 5. Detail pages

One record, one page, always laid out the same way.

**Header** (the page template, with these specifics)

- Breadcrumb back to the list.
- Title: the record's name or reference.
- **Status badge beside the title**, from `se-status`. If the record has two states (an order's fulfilment and its payment), both badges sit there, fulfilment first.
- One metadata line under the title: who and when. "Placed by Adaeze O. on 6 Oct 2026, 14:20".
- Actions top right, following pattern 1. Destructive actions are secondary buttons that open the confirmation dialog; they are never the primary button.

**Body** (`.se-detail`)

- **Main column, left:** what the record *is*: its lines, its content, its tabs.
- **Side column, right (320px):** what is *known about* it. First a card of key facts as a key/value list (`dl seKv`), then the **activity history** (`se-activity`).
- Below 1024px the side column drops under the main column. The order is then: main content, facts, history.

**Activity history**

- Newest first.
- Each entry: what happened, who did it (when a person did), and the date and time.
- Entries are written in the past tense as fragments: "Payment received", "Approved", "Rejected: margin too thin at that price".
- Every state change the audit log records for this record appears here. If it changed the status badge, it is in the history.
- A coloured dot only for entries that are a success, a warning or a failure. Routine entries are neutral.

**Rules**

- Facts that are numbers are right-aligned with tabular figures (`numeric`).
- A fact with no value shows a dash, not a blank and not "N/A".
- Related records are links to their own detail pages, not copies of their data.
- Tabs are for different views of this record (Items, Payments, Delivery). If two tabs need comparing, they should be one tab.

**Components:** `se-page`, `se-status`, `se-tabs`, `seTabPanel`, `se-card`, `dl seKv` / `seKvItem`, `se-activity`.

---

## 6. Loading

**Skeletons that match what is coming. Never a spinner on a page.**

| What is loading | What to show |
|---|---|
| A table | `se-table [loading]`: rows of bars in the table's own columns |
| Metric cards | `se-skeleton shape="metric"` in each card's place |
| A chart | The chart's own `loading` state (same height) |
| A detail page | `se-skeleton shape="detail"` in the main column, `shape="text"` in each side card |
| A form in a drawer | `se-skeleton shape="form"` |
| An action in progress | The button's `loading` state |

**Rules**

- **The page frame renders at once.** Shell, title, actions and filter bar appear immediately; only the region waiting for data is a skeleton. A page is never blank and never one big placeholder.
- **The skeleton has the size of the real thing**, so nothing jumps when the data arrives.
- **Skeletons are for the first load only.** When a list is re-sorted, re-filtered, paged or refreshed, the rows already on screen stay until the new ones arrive. Replacing data with a skeleton on every interaction makes a fast app feel slow.
- The loading region has `aria-busy="true"`; the skeleton itself is hidden from assistive technology.
- **No full-page spinners, no blocking overlays, no "Loading..." text** standing in for a layout.
- If something has been loading for more than about ten seconds, treat it as an error (pattern 7) and offer to try again.

**Components:** `se-skeleton`, `se-table`, chart `loading`, `seButton [loading]`.

---

## 7. Errors

**Inline where the person can fix it. A banner where they cannot. An action in both.**

| Situation | Where | What it offers |
|---|---|---|
| A field is empty or wrong | Under the field (`se-field [error]`) | The message says how to fix it; focus goes to the first such field |
| A form could not be saved (server, network) | Danger banner at the top of the form | "Try again"; their input is untouched |
| A list or page could not load | The table's error state, or a danger banner where the content would be | "Try again" |
| The record does not exist (deleted, bad link) | Where the content would be: heading, one line, one action | "Back to orders" |
| The person is not allowed | Where the content would be | Who can do it, or "Back to ..." |
| A row action failed (nowhere to put a banner) | Danger toast | "Try again" as the toast's action |
| Something the system noticed (low stock, sync failed) | Warning banner at the top of the page it concerns | The action that addresses it |

**How an error is written**

- **Say what happened, in the person's terms:** "The supplier was not saved", not "Request failed" and never a status code.
- **Say what it means for their work:** "What you typed is still here", "Nothing has been changed".
- **Say what to do,** as the action's label: "Try again", "Review stock", "Back to orders".
- A field error states the fix: "Enter a discount between 1 and 90 percent", not "Invalid value".
- No blame, no exclamation marks, no "Oops".

**Rules**

- **A failed load is never shown as an empty list.** "No orders yet" when the request failed tells the owner the business has no orders.
- **A failed save never clears the form.**
- **Errors are announced.** Field errors are in a live region; danger and warning banners are `role="alert"`.
- **Colour is never the only signal:** every error has an icon and words.
- An error stays until it is fixed or dismissed. It is never a toast, except the row-action case above.
- Messages the API returns for validation (it is the source of truth for business rules such as the 20-unit minimum) are shown as they are, in the place they apply.

**Components:** `se-field`, `se-banner`, `se-table [error]`, `se-empty-state`, `SeToastService`.

---

## 8. Formatting data

The same value reads the same way on every screen.

| Value | Rule | How |
|---|---|---|
| Money | The configured currency symbol, digit grouping, whole units in tables and cards, two decimals on invoices and ledgers | `seMoney` pipe, `SeCurrencyService.format` |
| Negative money | Minus sign before the symbol | automatic |
| Numbers in a column | Right-aligned, tabular figures | `numeric: true` on the column, `.se-num` |
| Dates | "6 Oct 2026" | `seDate` |
| Date and time | "6 Oct 2026, 14:20", 24-hour | `seDate: 'datetime'` |
| A missing value | A dash "–", never blank, "N/A", "null" or "0" | automatic in the table and pipes |
| A domain state | The shared wording and colour | `se-status` |
| Percentages | One decimal: "12.4%" | |
| Counts with a noun | Singular and plural both written properly: "1 supplier", "3 suppliers". Never "supplier(s)" | |

**Rules**

- **A currency symbol is never typed into a template.** It is configuration, loaded from the API.
- **Text is sentence case** everywhere: buttons, titles, labels, table headers (the header style upper-cases them; the source text is still sentence case).
- **Identifiers are shown as the business writes them** ("SE-48210"), not as database ids.
- **Times are in the viewer's local time.** A record's activity history is the place for exact times.

---

## 9. Navigation and roles

- **The sidebar shows only what this role can use.** An item the role cannot open is absent, not greyed out. A staff member with the Inventory role sees a visibly smaller app than the owner.
- **The same is true of actions on a page:** a button the person may not use is not rendered. Disabled is for "not right now" (nothing selected, already refunded), with the reason available; it is not for "not you".
- **Hiding is a courtesy, not security.** Every permission is enforced by the API. The interface only avoids offering what will be refused.
- **Sidebar order** follows how often the role does the thing, not the order modules were built. Groups have a short title; a group of one item has none.
- **A count badge on a sidebar item** means "this many things are waiting for you" (approvals to decide, stock exceptions). It is never a total.
- **The partner portal has no links into the storefront or the wholesale portal,** and shows no customer names, phone numbers or addresses anywhere.
- **Global search** sits in the top bar in the same place in every app, and searches what that role can see.

**Components:** `se-shell`.
