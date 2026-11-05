describe('Seed guards', () => {
  const originalEnv = process.env;
  const originalExit = process.exit;
  const originalError = console.error;

  let exitMock: jest.Mock;
  let errorMock: jest.Mock;

  beforeEach(() => {
    exitMock = jest.fn();
    errorMock = jest.fn();
    process.exit = exitMock as never;
    console.error = errorMock as never;
    process.env = { ...originalEnv };
    delete process.env.NODE_ENV;
    delete process.env.ALLOW_SEED;
    delete process.env.DB_HOST;
    delete process.env.DATABASE_URL;
    delete process.env.SEED_USER_PASSWORD;
    delete process.env.ALLOW_REMOTE_SEED;
  });

  afterEach(() => {
    process.env = originalEnv;
    process.exit = originalExit;
    console.error = originalError;
    jest.restoreAllMocks();
  });

  describe('requireSafeEnvironment', () => {
    let requireSafeEnvironment: () => void;

    beforeEach(async () => {
      const mod = await import('./seed');
      requireSafeEnvironment = mod.requireSafeEnvironment;
    });

    it('exits when NODE_ENV=production', () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_SEED = 'true';
      expect(() => requireSafeEnvironment()).not.toThrow();
      expect(exitMock).toHaveBeenCalledWith(1);
      expect(errorMock).toHaveBeenCalledWith(
        expect.stringContaining('NODE_ENV=production'),
      );
    });

    it('exits when ALLOW_SEED is not true', () => {
      process.env.NODE_ENV = 'development';
      expect(() => requireSafeEnvironment()).not.toThrow();
      expect(exitMock).toHaveBeenCalledWith(1);
      expect(errorMock).toHaveBeenCalledWith(
        expect.stringContaining('ALLOW_SEED=true'),
      );
    });

    it('exits for non-local DB host without ALLOW_REMOTE_SEED', () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_SEED = 'true';
      process.env.DB_HOST = 'db.production.example.com';
      expect(() => requireSafeEnvironment()).not.toThrow();
      expect(exitMock).toHaveBeenCalledWith(1);
      expect(errorMock).toHaveBeenCalledWith(
        expect.stringContaining('non-local database host'),
      );
    });

    it('checks DATABASE_URL instead of trusting a local DB_HOST override', () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_SEED = 'true';
      process.env.DB_HOST = 'localhost';
      process.env.DATABASE_URL = 'postgresql://seed-user:secret@db.example.com/seentair';

      expect(() => requireSafeEnvironment()).not.toThrow();
      expect(exitMock).toHaveBeenCalledWith(1);
      expect(errorMock).toHaveBeenCalledWith(
        expect.stringContaining('non-local database host'),
      );
      expect(errorMock.mock.calls.flat().join(' ')).not.toContain('secret');
    });

    it('rejects malformed database URLs without logging them', () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_SEED = 'true';
      process.env.DATABASE_URL = 'not-a-database-url-with-secret';

      expect(() => requireSafeEnvironment()).not.toThrow();
      expect(exitMock).toHaveBeenCalledWith(1);
      expect(errorMock).toHaveBeenCalledWith(
        expect.stringContaining('DATABASE_URL is invalid'),
      );
      expect(errorMock.mock.calls.flat().join(' ')).not.toContain('secret');
    });

    it('allows localhost with ALLOW_SEED=true', () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_SEED = 'true';
      process.env.DB_HOST = 'localhost';
      expect(() => requireSafeEnvironment()).not.toThrow();
      expect(exitMock).not.toHaveBeenCalled();
    });

    it('allows 127.0.0.1 with ALLOW_SEED=true', () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_SEED = 'true';
      process.env.DB_HOST = '127.0.0.1';
      expect(() => requireSafeEnvironment()).not.toThrow();
      expect(exitMock).not.toHaveBeenCalled();
    });

    it('allows ::1 with ALLOW_SEED=true', () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_SEED = 'true';
      process.env.DB_HOST = '::1';
      expect(() => requireSafeEnvironment()).not.toThrow();
      expect(exitMock).not.toHaveBeenCalled();
    });

    it('allows a local DATABASE_URL', () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_SEED = 'true';
      process.env.DATABASE_URL = 'postgresql://seed-user:secret@localhost/seentair_test';
      expect(() => requireSafeEnvironment()).not.toThrow();
      expect(exitMock).not.toHaveBeenCalled();
    });
  });

  describe('requireSeedPassword', () => {
    let requireSeedPassword: () => string;

    beforeEach(async () => {
      const mod = await import('./seed');
      requireSeedPassword = mod.requireSeedPassword;
    });

    it('exits when SEED_USER_PASSWORD is unset', () => {
      delete process.env.SEED_USER_PASSWORD;
      expect(() => requireSeedPassword()).not.toThrow();
      expect(exitMock).toHaveBeenCalledWith(1);
      expect(errorMock).toHaveBeenCalledWith(
        expect.stringContaining('SEED_USER_PASSWORD'),
      );
    });

    it('exits when SEED_USER_PASSWORD is shorter than 12 chars', () => {
      process.env.SEED_USER_PASSWORD = 'short';
      expect(() => requireSeedPassword()).not.toThrow();
      expect(exitMock).toHaveBeenCalledWith(1);
    });

    it('returns the password when it is >= 12 chars', () => {
      process.env.SEED_USER_PASSWORD = 'correct-horse-battery';
      expect(requireSeedPassword()).toBe('correct-horse-battery');
      expect(exitMock).not.toHaveBeenCalled();
    });
  });

  describe('no secret values in output', () => {
    it('error messages do not contain the password', () => {
      process.env.SEED_USER_PASSWORD = 'super-secret-password-123';
      delete process.env.SEED_USER_PASSWORD;
      void import('./seed').then((m) => {
        const fn = m.requireSeedPassword;
        expect(() => fn()).not.toThrow();
        expect(exitMock).toHaveBeenCalledWith(1);
        const calls = errorMock.mock.calls.map((c) => c.join(' '));
        calls.forEach((call) => {
          expect(call).not.toContain('super-secret-password-123');
        });
      });
    });
  });
});
