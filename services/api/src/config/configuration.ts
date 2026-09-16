// Currency and locale are configuration, never hardcoded (Open Question #6).
export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    name: process.env.DB_NAME ?? 'seentair_dev',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-only-secret',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '900s',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
    refreshTtlMs: parseInt(process.env.JWT_REFRESH_TTL_MS ?? String(7 * 24 * 3_600_000), 10),
  },
  security: {
    // Brute-force protection (client requirement): lock after N failures.
    maxFailedLogins: parseInt(process.env.MAX_FAILED_LOGINS ?? '5', 10),
    lockoutMinutes: parseInt(process.env.LOCKOUT_MINUTES ?? '15', 10),
    corsOrigins: (
      process.env.CORS_ORIGINS ??
      'http://localhost:4200,http://localhost:4201,http://localhost:4202'
    )
      .split(',')
      .map((o) => o.trim()),
  },
  business: {
    currencyCode: process.env.CURRENCY_CODE ?? 'NGN',
    currencySymbol: process.env.CURRENCY_SYMBOL ?? '₦',
    locale: process.env.LOCALE ?? 'en-NG',
  },
  partners: {
    // Confirmed profit-sharing model (appendix 17).
    totalShares: parseInt(process.env.TOTAL_SHARES ?? '1000000', 10),
    founderSharePct: parseFloat(process.env.FOUNDER_SHARE_PCT ?? '60'),
    partnersSharePct: parseFloat(process.env.PARTNERS_SHARE_PCT ?? '40'),
    reinvestmentPct: parseFloat(process.env.PROFIT_REINVESTMENT_PCT ?? '40'),
    dividendsPct: parseFloat(process.env.PROFIT_DIVIDENDS_PCT ?? '40'),
    reservePct: parseFloat(process.env.PROFIT_RESERVE_PCT ?? '20'),
  },
  sms: {
    // Termii or Twilio TBD (07-Technical-Architecture) — Termii adapter first.
    termiiApiKey: process.env.TERMII_API_KEY ?? '',
    termiiBaseUrl: process.env.TERMII_BASE_URL ?? 'https://api.ng.termii.com',
    senderId: process.env.SMS_SENDER_ID ?? 'Seentair',
  },
  returns: {
    // Confirmed policy (appendix 10): request within 12h of receipt,
    // physical return within 24h of the request. Configuration, not hardcoded.
    requestWindowHours: parseInt(process.env.RETURN_REQUEST_WINDOW_HOURS ?? '12', 10),
    completionWindowHours: parseInt(process.env.RETURN_COMPLETION_WINDOW_HOURS ?? '24', 10),
  },
  gigl: {
    apiKey: process.env.GIGL_API_KEY ?? '',
    baseUrl: process.env.GIGL_BASE_URL ?? 'https://api.giglogistics.com',
  },
  wholesale: {
    // Confirmed MOQ (appendix 06). Configuration, not hardcoded.
    moq: parseInt(process.env.WHOLESALE_MOQ ?? '20', 10),
  },
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY ?? '',
    baseUrl: process.env.PAYSTACK_BASE_URL ?? 'https://api.paystack.co',
  },
  production: {
    // Confirmed stages, customizable to real factory-floor terms (appendix 02).
    // Order matters; the last stage is the completion stage.
    stages: (
      process.env.PRODUCTION_STAGES ??
      'Production Planned,Cutting,Sewing,Finishing,Quality Control,Completed'
    )
      .split(',')
      .map((s) => s.trim()),
  },
});
