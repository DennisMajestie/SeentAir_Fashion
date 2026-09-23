/**
 * Deployed builds. Point this at the hosted API (Render) — it is swapped
 * in for environment.ts by the production fileReplacements in angular.json.
 * Not a secret: this URL is visible in the shipped bundle either way.
 */
export const environment = {
  production: true,
  apiBase: 'https://seentair-backend.onrender.com/api/v1',
  /** Wholesale portal on Vercel — update to the actual project URL after deploy. */
  wholesaleUrl: 'https://seentair-wholesale.vercel.app',
};
