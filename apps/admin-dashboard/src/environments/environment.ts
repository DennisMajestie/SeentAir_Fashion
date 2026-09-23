/** Local development: the API runs on this machine. */
export const environment = {
  production: false,
  apiBase: 'http://localhost:3000/api/v1',
  /** Retail storefront (separate app). Run it with: npm start -- --port 4200 */
  storefrontUrl: 'http://localhost:4200',
  /** Wholesale portal (separate app). Run it with: npm start -- --port 4201 */
  wholesaleUrl: 'http://localhost:4201',
  /** Partner/investor portal (separate app). Run it with: npm start -- --port 4203 */
  partnerUrl: 'http://localhost:4203',
};
