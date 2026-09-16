import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { RoleName, UserStatus } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { MailAdapter } from './mail.adapter';
import { PasswordResetToken } from './password-reset-token.entity';
import { RefreshToken } from './refresh-token.entity';

describe('AuthService — brute-force lockout & refresh rotation', () => {
  let service: AuthService;
  let user: Record<string, unknown>;
  let refreshRecord: Record<string, unknown> | null;

  const userRepo = { update: jest.fn() };
  let resetRecord: Record<string, unknown> | null;
  const resetRepo = {
    findOne: jest.fn(async () => resetRecord),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
    update: jest.fn(async () => ({ affected: 1 })),
  };
  const mailAdapter = {
    send: jest.fn(async (_to: string, _subject: string, _body: string) => undefined),
    configured: false,
  };
  const refreshRepo = {
    findOne: jest.fn(async () => refreshRecord),
    create: jest.fn((v) => ({ id: 'jti-new', ...v })),
    save: jest.fn(async (v) => v),
    update: jest.fn(async () => ({ affected: 1 })),
  };
  const usersService: Record<string, jest.Mock> = {
    findByEmailWithPassword: jest.fn(async () => user),
    findById: jest.fn(async () => ({ id: 'u1', status: UserStatus.ACTIVE, role: { name: RoleName.CUSTOMER } })),
    findByIdWithTotpSecret: jest.fn(),
    create: jest.fn(),
  };
  const jwtPayloads = new Map<string, unknown>();
  const jwtService = {
    signAsync: jest.fn(async (payload: { type: string }) => {
      const token = `tok-${payload.type}-${Math.random()}`;
      jwtPayloads.set(token, payload);
      return token;
    }),
    verifyAsync: jest.fn(),
    decode: jest.fn((token: string) => jwtPayloads.get(token) ?? null),
  };
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        'jwt.secret': 's',
        'jwt.accessTtl': '900s',
        'jwt.refreshTtl': '7d',
        'jwt.refreshTtlMs': 1000000,
        'security.maxFailedLogins': 3,
        'security.lockoutMinutes': 15,
        'mail.resetTtlMinutes': 30,
        'mail.resetUrlBase': 'http://localhost:4200/reset-password',
      };
      return values[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jwtPayloads.clear();
    refreshRecord = null;
    resetRecord = null;
    user = {
      id: 'u1',
      email: 'c@x.test',
      status: UserStatus.ACTIVE,
      passwordHash: await bcrypt.hash('CorrectHorse1!', 4),
      failedLoginAttempts: 0,
      lockedUntil: null,
      role: { name: RoleName.CUSTOMER },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: config },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshRepo },
        { provide: getRepositoryToken(PasswordResetToken), useValue: resetRepo },
        { provide: MailAdapter, useValue: mailAdapter },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  describe('lockout', () => {
    it('increments the failure counter on a wrong password', async () => {
      await expect(service.login('c@x.test', 'wrong')).rejects.toThrow(UnauthorizedException);
      expect(userRepo.update).toHaveBeenCalledWith('u1', { failedLoginAttempts: 1 });
    });

    it('locks the account at the threshold', async () => {
      user.failedLoginAttempts = 2; // third failure hits maxFailedLogins=3
      await expect(service.login('c@x.test', 'wrong')).rejects.toThrow(UnauthorizedException);
      const updateArg = userRepo.update.mock.calls[0][1];
      expect(updateArg.lockedUntil).toBeInstanceOf(Date);
      expect(updateArg.failedLoginAttempts).toBe(0);
    });

    it('rejects logins while locked — even with the correct password', async () => {
      user.lockedUntil = new Date(Date.now() + 60_000);
      await expect(service.login('c@x.test', 'CorrectHorse1!')).rejects.toThrow('temporarily locked');
    });

    it('a successful login resets the counter and issues tokens', async () => {
      user.failedLoginAttempts = 2;
      const pair = (await service.login('c@x.test', 'CorrectHorse1!')) as {
        accessToken: string;
      };
      expect(userRepo.update).toHaveBeenCalledWith('u1', {
        failedLoginAttempts: 0,
        lockedUntil: null,
      });
      expect(pair.accessToken).toBeTruthy();
      expect(refreshRepo.save).toHaveBeenCalled(); // server-side refresh record
    });
  });

  describe('refresh rotation', () => {
    beforeEach(() => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'u1',
        email: 'c@x.test',
        role: RoleName.CUSTOMER,
        type: 'refresh',
        jti: 'jti-old',
      });
    });

    it('rotates: old token revoked and linked to its replacement', async () => {
      refreshRecord = { id: 'jti-old', userId: 'u1', expiresAt: new Date(Date.now() + 10000), revokedAt: null };
      await service.refresh('old-token');
      expect(refreshRepo.update).toHaveBeenCalledWith(
        'jti-old',
        expect.objectContaining({ revokedAt: expect.any(Date), replacedBy: 'jti-new' }),
      );
    });

    it('REUSE of a rotated token revokes the whole session family', async () => {
      refreshRecord = { id: 'jti-old', userId: 'u1', expiresAt: new Date(Date.now() + 10000), revokedAt: new Date() };
      await expect(service.refresh('stolen-token')).rejects.toThrow('reuse detected');
      expect(refreshRepo.update).toHaveBeenCalledWith(
        { userId: 'u1', revokedAt: expect.anything() },
        { revokedAt: expect.any(Date) },
      );
    });

    it('rejects a refresh token with no server-side record', async () => {
      refreshRecord = null;
      await expect(service.refresh('ghost-token')).rejects.toThrow('no longer valid');
    });

    it('access tokens cannot be used as refresh tokens', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'u1', type: 'access' });
      await expect(service.refresh('access-token')).rejects.toThrow('Not a refresh token');
    });
  });

  it('logout revokes all active refresh tokens server-side', async () => {
    refreshRepo.update.mockResolvedValue({ affected: 3 });
    const result = await service.logout('u1');
    expect(result.revoked).toBe(3);
  });

  describe('2FA (TOTP)', () => {
    it('a 2FA-enabled login returns a challenge, not tokens', async () => {
      user.totpEnabled = true;
      const result = await service.login('c@x.test', 'CorrectHorse1!');
      expect(result).toEqual({ requires2fa: true, challengeToken: expect.any(String) });
      expect(refreshRepo.save).not.toHaveBeenCalled(); // no session yet
    });

    it('a correct code on a valid challenge completes the login', async () => {
      const { authenticator } = await import('otplib');
      const secret = authenticator.generateSecret();
      jwtService.verifyAsync.mockResolvedValue({ sub: 'u1', type: '2fa' });
      usersService.findByIdWithTotpSecret = jest.fn(async () => ({
        id: 'u1',
        email: 'c@x.test',
        status: UserStatus.ACTIVE,
        totpEnabled: true,
        totpSecret: secret,
        role: { name: RoleName.MANAGEMENT },
      })) as never;
      const pair = await service.verify2fa('challenge', authenticator.generate(secret));
      expect(pair.accessToken).toBeTruthy();
    });

    it('a wrong code is rejected', async () => {
      const { authenticator } = await import('otplib');
      jwtService.verifyAsync.mockResolvedValue({ sub: 'u1', type: '2fa' });
      usersService.findByIdWithTotpSecret = jest.fn(async () => ({
        id: 'u1',
        email: 'c@x.test',
        status: UserStatus.ACTIVE,
        totpEnabled: true,
        totpSecret: authenticator.generateSecret(),
        role: { name: RoleName.MANAGEMENT },
      })) as never;
      await expect(service.verify2fa('challenge', '000000')).rejects.toThrow('Incorrect');
    });

    it('an access token cannot stand in for a 2FA challenge', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'u1', type: 'access' });
      await expect(service.verify2fa('access-token', '123456')).rejects.toThrow(
        'Not a 2FA challenge',
      );
    });

    it('disabling 2FA requires a live code and revokes all sessions', async () => {
      const { authenticator } = await import('otplib');
      const secret = authenticator.generateSecret();
      usersService.findByIdWithTotpSecret = jest.fn(async () => ({
        id: 'u1',
        totpEnabled: true,
        totpSecret: secret,
      })) as never;
      await expect(service.disable2fa('u1', '000000')).rejects.toThrow('Incorrect');
      await service.disable2fa('u1', authenticator.generate(secret));
      expect(userRepo.update).toHaveBeenCalledWith('u1', { totpEnabled: false, totpSecret: null });
      expect(refreshRepo.update).toHaveBeenCalledWith(
        { userId: 'u1', revokedAt: expect.anything() },
        { revokedAt: expect.any(Date) },
      );
    });
  });

  describe('password reset', () => {
    it('answers identically for unknown emails (no enumeration) and sends nothing', async () => {
      usersService.findByEmailWithPassword.mockResolvedValueOnce(null as never);
      const res = await service.forgotPassword('ghost@x.test');
      expect(res.message).toContain('If that email is registered');
      expect(mailAdapter.send).not.toHaveBeenCalled();
      expect(resetRepo.save).not.toHaveBeenCalled();
    });

    it('known email: stores only the token HASH, emails the raw link', async () => {
      await service.forgotPassword('c@x.test');
      const saved = resetRepo.save.mock.calls[0][0] as { tokenHash: string };
      expect(saved.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      const mailBody = mailAdapter.send.mock.calls[0][2] as string;
      expect(mailBody).toContain('reset-password?token=');
      expect(mailBody).not.toContain(saved.tokenHash); // raw != stored hash
    });

    it('rejects expired, used, or unknown tokens', async () => {
      resetRecord = null;
      await expect(service.resetPassword('a'.repeat(64), 'NewPass123!')).rejects.toThrow('invalid or has expired');
      resetRecord = { id: 'r1', userId: 'u1', usedAt: new Date(), expiresAt: new Date(Date.now() + 1000) };
      await expect(service.resetPassword('a'.repeat(64), 'NewPass123!')).rejects.toThrow('invalid or has expired');
      resetRecord = { id: 'r1', userId: 'u1', usedAt: null, expiresAt: new Date(Date.now() - 1000) };
      await expect(service.resetPassword('a'.repeat(64), 'NewPass123!')).rejects.toThrow('invalid or has expired');
    });

    it('a valid reset updates the hash, clears lockout, and revokes all sessions', async () => {
      resetRecord = { id: 'r1', userId: 'u1', usedAt: null, expiresAt: new Date(Date.now() + 60000) };
      await service.resetPassword('b'.repeat(64), 'NewPass123!');
      expect(resetRepo.update).toHaveBeenCalledWith('r1', { usedAt: expect.any(Date) });
      const update = userRepo.update.mock.calls[0][1];
      expect(update.passwordHash).toBeTruthy();
      expect(update.failedLoginAttempts).toBe(0);
      expect(update.lockedUntil).toBeNull();
      expect(refreshRepo.update).toHaveBeenCalledWith(
        { userId: 'u1', revokedAt: expect.anything() },
        { revokedAt: expect.any(Date) },
      );
    });
  });
});
