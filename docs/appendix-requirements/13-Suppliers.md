# 13. Suppliers

> **Scope change confirmed by client during review.** The client does not have a stable material supplier and sources materials from multiple suppliers interchangeably. She explicitly stated: *"We don't have a stable supplier. We source from multiple suppliers, so their info does not need to be in the system. We just need to record as listed in the 'bulleted' ones."*

This means: **no dedicated Supplier entity, supplier profile, or supplier payment-history module should be built for MVP.**

## What to build instead

Only the material-level tracking already described in `03-Raw-Materials.md`:
- Materials purchased
- Purchase costs
- (Optional free-text note per purchase if the business wants to jot down who they bought from, but this is not a structured/required field)

## Note for the team

The original discovery document proposed a full supplier profile/history/outstanding-obligations module. That proposal is now **descoped** based on the client's clarification. Do not build supplier relationship management for MVP.
