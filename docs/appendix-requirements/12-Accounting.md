# 12. Accounting & Finance

## Purpose

The platform is intended to **replace the current manual accounting process** entirely.

## Areas requiring visibility

- Sales
- Expenses
- Purchases
- Supplier payments (in aggregate — see scope note in `13-Suppliers.md`)
- Production costs
- Cost of goods (COGS)
- Payroll
- Taxes
- Profit
- Loss
- Financial reports

## Reporting requirement (from clarification round)

Client wants **all** financial report types available: income, expenditure, investment, loss, and profit reports. Build a flexible reporting module rather than a fixed small set of reports.

## Credit policy

Customers are **not** expected to owe the business — no customer credit terms to build for on the retail/wholesale side.

## Data/entities implied

- `LedgerEntry` (type: sale | expense | purchase | payroll | tax, amount, category, date, reference)
- `FinancialReport` (type, period, generated data)
