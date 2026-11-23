/** Local development: the API runs on this machine. */
export const environment = {
  production: false,
  apiBase: 'http://localhost:3000/api/v1',
  /** Distributors portal (separate app). Run it with: npm start -- --port 4201 */
  distributorsUrl: 'http://localhost:4201',
  /** Admin/operations dashboard (separate app). Run it with: npm start -- --port 4202 */
  adminUrl: 'http://localhost:4202',
  /** Partner/investor portal (separate app). Run it with: npm start -- --port 4203 */
  partnerUrl: 'http://localhost:4203',
  /**
   * Support number for customer-facing help surfaces (floating WhatsApp button
   * and order tracking dock). Digits are normalised to a wa.me link. An operator
   * can override this through the dashboard's "Storefront WhatsApp link" setting.
   */
  supportWhatsapp: '+2347010361332',
  /** Shown under the help button, e.g. 'Mon-Sat, 9am-6pm WAT'. Empty = hidden. */
  supportHours: '',
};
