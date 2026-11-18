/*
 * Pre-deploy API-level smoke test (plan item 16).
 *
 *   SMOKE_API_BASE=https://host/api/v1 \
 *   SMOKE_ADMIN_EMAIL=... SMOKE_ADMIN_PASSWORD=... \
 *   SMOKE_VARIANT_ID=<uuid of an in-stock variant> \
 *   SMOKE_CUSTOMER_EMAIL=... SMOKE_CUSTOMER_PASSWORD=... \
 *   SMOKE_RUN_WHOLESALE=true \
 *   npm run test:smoke
 *
 * The customer and wholesale legs are skipped when their credentials are not
 * supplied. With no base URL/credentials at all the script exits successfully
 * with SKIP, so local development stays offline. Secrets come only from env.
 */
require('dotenv').config(
  process.env.DOTENV_CONFIG_PATH ? { path: process.env.DOTENV_CONFIG_PATH } : undefined,
);

const BASE = (process.env.SMOKE_API_BASE ?? '').replace(/\/+$/, '');
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD;
const VARIANT_ID = process.env.SMOKE_VARIANT_ID;

if (!BASE || !ADMIN_EMAIL || !ADMIN_PASSWORD || !VARIANT_ID) {
  console.log('SKIP: set SMOKE_API_BASE, SMOKE_ADMIN_EMAIL, SMOKE_ADMIN_PASSWORD and SMOKE_VARIANT_ID.');
  process.exit(0);
}

async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${path}: HTTP ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function login(email, password) {
  const result = await api('/auth/login', { method: 'POST', body: { email, password } });
  if (!result.accessToken) throw new Error('Smoke account cannot use 2FA');
  return result.accessToken;
}

function check(condition, message) {
  if (!condition) throw new Error(`SMOKE FAILED: ${message}`);
}

async function retailFlow(admin) {
  const order = await api('/orders', {
    method: 'POST',
    token: admin,
    body: {
      items: [{ variantId: VARIANT_ID, quantity: 1 }],
      channel: 'retail',
      source: 'smoke',
    },
  });
  check(order?.id, 'order was not created');

  const paid = await api(`/orders/${order.id}/payment`, {
    method: 'POST',
    token: admin,
    body: { method: 'bank_transfer', amount: order.totalAmount },
  });
  check(paid?.paymentStatus === 'paid', 'payment did not mark the order paid');

  for (const status of ['processing', 'shipped', 'delivered']) {
    await api(`/orders/${order.id}/status`, {
      method: 'PATCH',
      token: admin,
      body: { status },
    });
  }

  const movements = await api(`/inventory/${VARIANT_ID}/movements`, { token: admin });
  const rows = movements?.data ?? movements ?? [];
  check(Array.isArray(rows) && rows.length > 0, 'no stock movement was recorded for the sale');

  if (!process.env.SMOKE_CUSTOMER_EMAIL || !process.env.SMOKE_CUSTOMER_PASSWORD) {
    console.log('SKIP return leg: set SMOKE_CUSTOMER_EMAIL/PASSWORD to exercise the refund path.');
    return;
  }
  const customer = await login(process.env.SMOKE_CUSTOMER_EMAIL, process.env.SMOKE_CUSTOMER_PASSWORD);
  const returned = await api('/returns', {
    method: 'POST',
    token: customer,
    body: { orderId: order.id, variantId: VARIANT_ID, reason: 'smoke test' },
  });
  check(returned?.id, 'return request was not accepted');
  await api(`/returns/${returned.id}/resolve`, {
    method: 'PATCH',
    token: admin,
    body: { decision: 'resolved', resolution: 'smoke test', restocked: true, damaged: false },
  });
  const after = await api(`/orders/${order.id}`, { token: admin });
  check(after?.status === 'returned', 'resolved return did not mark the order returned');
  const afterMovements = await api(`/inventory/${VARIANT_ID}/movements`, { token: admin });
  check(
    (afterMovements?.data ?? afterMovements ?? []).length > rows.length,
    'return did not restore stock in the ledger',
  );
}

async function wholesaleFlow(admin) {
  if (!process.env.SMOKE_RUN_WHOLESALE) {
    console.log('SKIP wholesale leg: set SMOKE_RUN_WHOLESALE=true (creates a throwaway buyer account).');
    return;
  }
  const stamp = Date.now();
  const email = `smoke-${stamp}@example.test`;
  const application = await api('/wholesale/apply', {
    method: 'POST',
    body: {
      name: 'Smoke Buyer',
      email,
      password: 'SmokePass123!',
      businessName: `Smoke Wholesale ${stamp}`,
      buyerType: 'retailer',
      city: 'Lagos',
      state: 'Lagos',
    },
  });
  const accountId = application?.id ?? application?.account?.id;
  check(accountId, 'wholesale application was not accepted');
  await api(`/wholesale/accounts/${accountId}`, {
    method: 'PATCH',
    token: admin,
    body: { status: 'approved' },
  });
  const buyer = await login(email, 'SmokePass123!');
  const invoices = await api('/wholesale/invoices', { token: buyer });
  check(invoices !== undefined, 'wholesale invoices endpoint did not respond');
}

(async () => {
  try {
    const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    await retailFlow(admin);
    await wholesaleFlow();
    console.log('SMOKE OK');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
})();
