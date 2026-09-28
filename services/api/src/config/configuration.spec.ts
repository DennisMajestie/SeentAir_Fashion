import configuration from './configuration';

describe('paystack.emailOverrideAllowed', () => {
  const env = process.env;
  const reset = () => {
    process.env = { ...env };
  };

  afterEach(() => {
    process.env = env;
  });

  const allowed = () => configuration().paystack.emailOverrideAllowed;

  it('is off in production when the key is absent', () => {
    reset();
    delete process.env.PAYSTACK_EMAIL_OVERRIDE_ALLOWED;
    process.env.NODE_ENV = 'production';
    expect(allowed()).toBe(false);
  });

  it('is on outside production when the key is absent', () => {
    reset();
    delete process.env.PAYSTACK_EMAIL_OVERRIDE_ALLOWED;
    process.env.NODE_ENV = 'development';
    expect(allowed()).toBe(true);
  });

  it('treats a blank value as unset, so .env.example does not disable it', () => {
    // The regression this guards: .env.example ships the key empty, and reading
    // '' as a literal false turned the override off in every local run that
    // needed it, with no error anywhere.
    reset();
    process.env.NODE_ENV = 'development';
    process.env.PAYSTACK_EMAIL_OVERRIDE_ALLOWED = '';
    expect(allowed()).toBe(true);
  });

  it('treats a whitespace-only value as unset', () => {
    reset();
    process.env.NODE_ENV = 'development';
    process.env.PAYSTACK_EMAIL_OVERRIDE_ALLOWED = '   ';
    expect(allowed()).toBe(true);
  });

  it('honours an explicit true in production', () => {
    reset();
    process.env.NODE_ENV = 'production';
    process.env.PAYSTACK_EMAIL_OVERRIDE_ALLOWED = 'true';
    expect(allowed()).toBe(true);
  });

  it('honours an explicit false outside production', () => {
    reset();
    process.env.NODE_ENV = 'development';
    process.env.PAYSTACK_EMAIL_OVERRIDE_ALLOWED = 'false';
    expect(allowed()).toBe(false);
  });
});
