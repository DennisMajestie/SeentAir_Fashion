# 03. Open Questions / Final Clarification List

These do not block starting architecture or data-model work, but should be resolved with the client before their related module enters development.

| # | Question | Affects | Priority |
|---|---|---|---|
| 1 | POS/physical sales: client's direct answer said "LATER," but the feature-priority table marked it "Must Have Now." Which is correct? | Sprint planning, `13-Project-Plan-Development-Phases.md` | **High — resolve before Sprint 0** |
| 2 | What criteria assign a wholesale customer to a price tier (volume, relationship length, manual negotiation)? | `05-Role-Permission-Matrix.md`, wholesale pricing logic | Medium |
| 3 | Is the sample-production cost in custom orders included in the original quotation, or billed separately? | Custom order payment flow | Medium |
| 4 | Should product reviews be published immediately or moderated/approved first? | Retail/Wholesale review feature | Medium |
| 5 | Partner/Investor portal is marked "Important Later," but its profit-sharing model is already fully specified — worth pulling forward? | `13-Project-Plan-Development-Phases.md` | Low |
| 6 | Confirm currency (assumed ₦ Naira) given mentions of international delivery. | Payments, Accounting, Data Model | **High — confirm before payment integration** |
| 7 | Does NDPR (Nigeria Data Protection Regulation) compliance need to be built in from day one, given customer PII will be stored? | `07-Technical-Architecture.md`, `11-QA-Testing-Strategy.md` | **High — confirm before data model finalization** |

## Process

Log the client's answer to each item directly in this file (with date), and update the corresponding spec document. Do not let these sit unresolved past Sprint 0 planning for the High-priority items.

## Client answers log

_(append answers here as they arrive, with date)_
