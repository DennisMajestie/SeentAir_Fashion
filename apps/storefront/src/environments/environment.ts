/** Local development: the API runs on this machine. */
export const environment = {
  production: false,
  apiBase: 'http://localhost:3000/api/v1',
  /** Wholesale portal (separate app). Run it with: npm start -- --port 4201 */
  wholesaleUrl: 'http://localhost:4201',
};
