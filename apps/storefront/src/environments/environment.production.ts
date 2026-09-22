/**
 * Deployed builds. Point this at the hosted API (Render) — it is swapped
 * in for environment.ts by the production fileReplacements in angular.json.
 * Not a secret: this URL is visible in the shipped bundle either way.
 */
export const environment = {
  production: true,
  apiBase: 'https://seentair-api.onrender.com/api/v1',
};
