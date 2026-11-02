const test = require('node:test');
const assert = require('node:assert/strict');
const { assertDisposableDatabase } = require('./test-db');

const localTestDatabase = {
  NODE_ENV: 'test',
  DB_HOST: 'localhost',
  DB_NAME: 'seentair_ci_test',
  DB_DISPOSABLE: 'true',
  DB_ALLOW_RESET: 'true',
};

test('allows an explicitly disposable local *_test database', () => {
  assert.doesNotThrow(() => assertDisposableDatabase(localTestDatabase));
});

test('rejects production before any database connection', () => {
  assert.throws(
    () => assertDisposableDatabase({ ...localTestDatabase, NODE_ENV: 'production' }),
    /not allowed when NODE_ENV=production/,
  );
});

test('rejects DATABASE_URL without echoing its contents', () => {
  let error;
  try {
    assertDisposableDatabase({
      ...localTestDatabase,
      DATABASE_URL: 'not-a-database-url',
    });
  } catch (caught) {
    error = caught;
  }
  assert.ok(error instanceof Error);
  assert.match(error.message, /refuses DATABASE_URL/);
  assert.equal(error.message.includes('not-a-database-url'), false);
});

test('rejects non-local hosts', () => {
  assert.throws(
    () => assertDisposableDatabase({ ...localTestDatabase, DB_HOST: 'database.example.test' }),
    /requires DB_HOST to be localhost/,
  );
});

test('rejects database names without the explicit test suffix', () => {
  assert.throws(
    () => assertDisposableDatabase({ ...localTestDatabase, DB_NAME: 'seentair_dev' }),
    /ending in _test/,
  );
});

test('requires both explicit reset acknowledgements', () => {
  assert.throws(
    () => assertDisposableDatabase({ ...localTestDatabase, DB_ALLOW_RESET: undefined }),
    /DB_DISPOSABLE=true and DB_ALLOW_RESET=true/,
  );
});
