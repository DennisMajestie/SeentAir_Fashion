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
};
