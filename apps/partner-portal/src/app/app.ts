import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Partner/Investor portal — the confirmed dashboard flow (appendix 17):
 * Business Overview → Investment Information → Performance →
 * Inventory Visibility → Accounts & Reports → Profit Sharing,
 * plus Documents & Messages and Investor Settings (approved screens P1–P8).
 * Read-mostly; aggregates only — never customer data.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {}
