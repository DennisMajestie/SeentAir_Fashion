import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { IsNull, Repository } from 'typeorm';
import { RoleName, UserStatus } from '../../common/enums';
import { JwtPayload } from '../../common/interfaces';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { RefreshToken } from './refresh-token.entity';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshRepo: Repository<RefreshToken>,
  ) {}

  /**
   * Public storefront self-registration. The role is ALWAYS customer —
   * staff/wholesale/partner roles are only ever assigned by an admin.
   */
  async register(input: {
    name: string;
    email: string;
    phone?: string;
    password: string;
  }): Promise<TokenPair> {
    const user = await this.usersService.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      password: input.password,
      role: RoleName.CUSTOMER,
    });
    return this.issueTokens(user.id, user.email, user.role.name);
  }

  /**
   * Brute-force protection: repeated failures temporarily lock the account
   * (in addition to per-IP throttling at the route). Error messages are
   * deliberately generic — no user enumeration.
   */
  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.usersService.findByEmailWithPassword(email);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new UnauthorizedException(
        'Account temporarily locked after repeated failed attempts. Try again later.',
      );
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      await this.recordFailedAttempt(user);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.userRepo.update(user.id, { failedLoginAttempts: 0, lockedUntil: null });
    }
    return this.issueTokens(user.id, user.email, user.role.name);
  }

  /**
   * Rotation with reuse detection: each refresh token is single-use. A
   * replay of an already-rotated token is treated as theft — the user's
   * entire active session family is revoked.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('jwt.secret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.type !== 'refresh' || !payload.jti) {
      throw new UnauthorizedException('Not a refresh token');
    }

    const record = await this.refreshRepo.findOne({ where: { id: payload.jti } });
    if (!record || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token no longer valid');
    }
    if (record.revokedAt) {
      // Reuse of a rotated token → assume theft, kill every session.
      await this.revokeAllForUser(record.userId);
      throw new UnauthorizedException('Refresh token reuse detected; all sessions revoked');
    }

    const user = await this.usersService.findById(payload.sub);
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account disabled');
    }

    const pair = await this.issueTokens(user.id, user.email, user.role.name);
    // Rotate: retire the old token and link it to its replacement.
    const newJti = this.extractJti(pair.refreshToken);
    await this.refreshRepo.update(record.id, { revokedAt: new Date(), replacedBy: newJti });
    return pair;
  }

  /** Real server-side logout: every active refresh token for the user dies. */
  async logout(userId: string): Promise<{ revoked: number }> {
    const result = await this.revokeAllForUser(userId);
    return { revoked: result };
  }

  private async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.refreshRepo.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    return result.affected ?? 0;
  }

  private async recordFailedAttempt(user: User): Promise<void> {
    const attempts = user.failedLoginAttempts + 1;
    const max = this.config.get<number>('security.maxFailedLogins') ?? 5;
    if (attempts >= max) {
      const minutes = this.config.get<number>('security.lockoutMinutes') ?? 15;
      await this.userRepo.update(user.id, {
        failedLoginAttempts: 0,
        lockedUntil: new Date(Date.now() + minutes * 60_000),
      });
    } else {
      await this.userRepo.update(user.id, { failedLoginAttempts: attempts });
    }
  }

  private async issueTokens(
    sub: string,
    email: string,
    role: JwtPayload['role'],
  ): Promise<TokenPair> {
    const secret = this.config.get<string>('jwt.secret');
    const refreshTtlMs = this.config.get<number>('jwt.refreshTtlMs') ?? 7 * 24 * 3_600_000;

    const record = await this.refreshRepo.save(
      this.refreshRepo.create({
        userId: sub,
        expiresAt: new Date(Date.now() + refreshTtlMs),
      }),
    );

    const accessToken = await this.jwtService.signAsync(
      { sub, email, role, type: 'access' } satisfies JwtPayload,
      { secret, expiresIn: this.config.get<string>('jwt.accessTtl') },
    );
    const refreshToken = await this.jwtService.signAsync(
      { sub, email, role, type: 'refresh', jti: record.id } satisfies JwtPayload,
      { secret, expiresIn: this.config.get<string>('jwt.refreshTtl') },
    );
    return { accessToken, refreshToken };
  }

  private extractJti(token: string): string | null {
    const decoded = this.jwtService.decode<JwtPayload | null>(token);
    return decoded?.jti ?? null;
  }
}
