# 17. Partners / Investors

## Important clarification

"Partners" in this platform means **business partners/investors** — people who have invested money in the business — **not affiliate marketers or referral partners**. This distinction affects the entire partner module design (see `23-Future-Vision.md` for the explicit statement that an affiliate/commission model is **not** part of the initial direction).

## Their role and access

- They invest money in the business.
- They receive **quarterly profit sharing**.
- They should have transparency around business performance.
- They should see appropriate financial/account information.
- They should have visibility into inventory.
- They should understand how the business is performing and how their investment is being used.
- They should **not** have access to the retail/wholesale customer-facing interfaces.

## Confirmed dashboard flow

```
Partner/Investor → Login → Business Overview → Investment Information →
Performance → Inventory Visibility → Accounts/Reports → Profit Sharing
```

## Profit-sharing model (confirmed in clarification round)

- Profit split: **40% reinvestment / 40% dividends (owners + investors) / 20% cash reserve.**
- Total shares: **1,000,000.**
- Share allocation: **60% to founder/CEO, 40% to partners.**
- Each partner is paid **according to their equity percentage** of that 40%.

## Data/entities implied

- `Partner` (name, equity_percentage, invested_amount)
- `ProfitDistribution` (period, total_profit, reinvestment_amount, dividend_pool, reserve_amount, per_partner_breakdown)

## Priority note

Marked **"Important Later"** in the feature-priority table, not MVP — see `24-MVP-Priorities.md`. Given how fully specified the profit-sharing model already is, this may be worth revisiting for earlier scheduling — flagged in `25-Remaining-Clarification-Questions.md`.
