/**
 * Deployed builds. Point this at the hosted API (Render)- it is swapped
 * in for environment.ts by the production fileReplacements in angular.json.
 * Not a secret: this URL is visible in the shipped bundle either way.
 */
export const environment = {
  production: true,
  apiBase: 'https://seentair-backend.onrender.com/api/v1',
  /** Distributors portal on Vercel, update to the actual project URL after deploy. */
  distributorsUrl: 'https://seentair-wholesale.vercel.app',
  /** Admin/operations dashboard (Vessa) on Vercel. */
  adminUrl: 'https://sceentair-dashboard.vercel.app',
  /** Partner/investor portal on Vercel. */
  partnerUrl: 'https://partner-portal-pi-ten.vercel.app',
  /**
   * Support number for customer-facing help surfaces (floating WhatsApp button
   * and order tracking dock). Digits are normalised to a wa.me link. An operator
   * can override this through the dashboard's "Storefront WhatsApp link" setting.
   */
  supportWhatsapp: '+2347010361332',
  /** Shown under the help button, e.g. 'Mon-Sat, 9am-6pm WAT'. Empty = hidden. */
  supportHours: '',
};
