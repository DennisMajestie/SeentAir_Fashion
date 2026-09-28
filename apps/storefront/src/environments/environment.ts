/** Local development: the API runs on this machine. */
export const environment = {
  production: false,
  apiBase: 'http://localhost:3000/api/v1',
  /** Wholesale portal (separate app). Run it with: npm start -- --port 4201 */
  wholesaleUrl: 'http://localhost:4201',
  /** Admin/operations dashboard (separate app). Run it with: npm start -- --port 4202 */
  adminUrl: 'http://localhost:4202',
  /** Partner/investor portal (separate app). Run it with: npm start -- --port 4203 */
  partnerUrl: 'http://localhost:4203',
  /**
   * Support contact for customer-facing help surfaces (the order tracking dock).
   * Empty string means "not configured": the WhatsApp button is hidden and a
   * plain "Contact support" link is shown instead. Deliberately blank until a
   * WhatsApp-enabled number is confirmed - a dead wa.me link is worse than none.
   */
  supportWhatsapp: '',
  /** Shown under the help button, e.g. 'Mon-Sat, 9am-6pm WAT'. Empty = hidden. */
  supportHours: '',
};
