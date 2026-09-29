/**
 * Deployed builds. Point this at the hosted API (Render)- it is swapped
 * in for environment.ts by the production fileReplacements in angular.json.
 * Not a secret: this URL is visible in the shipped bundle either way.
 */
export const environment = {
  production: true,
  apiBase: 'https://seentair-backend.onrender.com/api/v1',
  /** Wholesale portal on Vercel, update to the actual project URL after deploy. */
  wholesaleUrl: 'https://seentair-wholesale.vercel.app',
  /** Admin/operations dashboard on Vercel. */
  adminUrl: 'https://admin-dashboard-chi-eight-15.vercel.app',
  /** Partner/investor portal on Vercel. */
  partnerUrl: 'https://partner-portal-pi-ten.vercel.app',
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
