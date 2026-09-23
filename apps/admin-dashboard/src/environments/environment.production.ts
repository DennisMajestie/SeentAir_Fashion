/**
 * Deployed builds. Point this at the hosted API (Render) — it is swapped
 * in for environment.ts by the production fileReplacements in angular.json.
 * Not a secret: this URL is visible in the shipped bundle either way.
 */
export const environment = {
  production: true,
  apiBase: 'https://seentair-backend.onrender.com/api/v1',
  /** Retail storefront on Vercel. */
  storefrontUrl: 'https://seent-air-fashion.vercel.app',
  /** Wholesale portal on Vercel. */
  wholesaleUrl: 'https://seentair-wholesale.vercel.app',
  /** Partner/investor portal on Vercel. */
  partnerUrl: 'https://partner-portal-pi-ten.vercel.app',
};
