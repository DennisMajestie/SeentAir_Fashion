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
import { RefreshToken } from './refresh-token.entity';

describe('AuthService — brute-force lockout & refresh rotation', () => {
  let service: AuthService;
  let user: Record<string, unknown>;
  let refreshRecord: Record<string, unknown> | null;

  const userRepo = { update: jest.fn() };
  const refreshRepo = {
    findOne: jest.fn(async () => refreshRecord),
    create: jest.fn((v) => ({ id: 'jti-new', ...v })),
    save: jest.fn(async (v) => v),
    update: jest.fn(async () => ({ affected: 1 })),
  };
  const usersService = {
    findByEmailWithPassword: jest.fn(async () => user),
    findById: jest.fn(async () => ({ id: 'u1', status: UserStatus.ACTIVE, role: { name: RoleName.CUSTOMER } })),
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
      };
      return values[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jwtPayloads.clear();
    refreshRecord = null;
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
      const pair = await service.login('c@x.test', 'CorrectHorse1!');
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
});
