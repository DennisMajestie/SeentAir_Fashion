const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function assertSafeSeedEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production') {
    throw new Error('Seeding is not allowed when NODE_ENV=production.');
  }
  if (env.ALLOW_SEED !== 'true') {
    throw new Error('Seeding requires ALLOW_SEED=true to be set explicitly.');
  }

  let host = env.DB_HOST ?? 'localhost';
  if (env.DATABASE_URL) {
    try {
      const url = new URL(env.DATABASE_URL);
      if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
        throw new Error();
      }
      host = url.hostname.replace(/^\[|\]$/g, '');
    } catch {
      throw new Error('DATABASE_URL is invalid; refusing to seed.');
    }
  }

  if (!LOCAL_HOSTS.has(host) && env.ALLOW_REMOTE_SEED !== 'true') {
    throw new Error(
      'Seeding against a non-local database host is not allowed. Set ALLOW_REMOTE_SEED=true to override.',
    );
  }
}

export function requireSeedPassword(env: NodeJS.ProcessEnv = process.env): string {
  const password = env.SEED_USER_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error(
      'SEED_USER_PASSWORD is missing or shorter than 12 characters. Set it explicitly before seeding.',
    );
  }
  return password;
}
