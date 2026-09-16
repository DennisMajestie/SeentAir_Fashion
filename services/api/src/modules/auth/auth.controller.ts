import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../../common/interfaces';
import { UsersService } from '../users/users.service';
import { AuthService, LoginResult, TokenPair } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { TotpCodeDto, Verify2faDto } from './dto/twofa.dto';

/**
 * Token transport (XSS-hardened):
 * - The REFRESH token travels only as an httpOnly SameSite=Strict cookie
 *   scoped to /api/v1/auth — page JavaScript can never read it, and
 *   cross-site requests never carry it.
 * - The ACCESS token is returned in the body; frontends hold it in memory
 *   only (never localStorage) and re-mint it via the cookie on page load.
 */
const REFRESH_COOKIE = 'seentair_rt';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {}

  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'strict' as const,
      secure: this.config.get<boolean>('security.cookieSecure') ?? false,
      path: '/api/v1/auth',
      maxAge: this.config.get<number>('jwt.refreshTtlMs') ?? 7 * 24 * 3_600_000,
    };
  }

  private deliver(res: Response, pair: TokenPair): { accessToken: string } {
    res.cookie(REFRESH_COOKIE, pair.refreshToken, this.cookieOptions());
    return { accessToken: pair.accessToken };
  }

  /** Tight per-IP throttle on credential endpoints (brute-force defense, layer 1). */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result: LoginResult = await this.authService.login(dto.email, dto.password);
    if ('requires2fa' in result) return result;
    return this.deliver(res, result);
  }

  /** Storefront self-registration — always a customer account. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    return this.deliver(res, await this.authService.register(dto));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token: string | undefined =
      (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? dto.refreshToken;
    if (!token) throw new UnauthorizedException('No refresh token');
    return this.deliver(res, await this.authService.refresh(token));
  }

  /** Step 2 of a 2FA login. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('2fa/verify')
  @HttpCode(200)
  async verify2fa(@Body() dto: Verify2faDto, @Res({ passthrough: true }) res: Response) {
    return this.deliver(res, await this.authService.verify2fa(dto.challengeToken, dto.code));
  }

  /** Begin 2FA enrolment: returns the secret + otpauth URI for an authenticator app. */
  @Post('2fa/setup')
  @ApiBearerAuth()
  setup2fa(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.setup2fa(user.id);
  }

  /** Activate 2FA by proving a live code. */
  @Post('2fa/enable')
  @ApiBearerAuth()
  enable2fa(@CurrentUser() user: AuthenticatedUser, @Body() dto: TotpCodeDto) {
    return this.authService.enable2fa(user.id, dto.code);
  }

  /** Disable 2FA — requires a live code, and revokes all sessions. */
  @Post('2fa/disable')
  @ApiBearerAuth()
  disable2fa(@CurrentUser() user: AuthenticatedUser, @Body() dto: TotpCodeDto) {
    return this.authService.disable2fa(user.id, dto.code);
  }

  /** Enumeration-safe: identical response whether or not the email exists. */
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(200)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  /** Server-side logout: revokes every active refresh token and clears the cookie. */
  @Post('logout')
  @HttpCode(200)
  @ApiBearerAuth()
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    return this.authService.logout(user.id);
  }

  @Get('me')
  @ApiBearerAuth()
  async me(@CurrentUser() user: AuthenticatedUser) {
    const fresh = await this.usersService.findById(user.id);
    return { ...user, name: fresh.name, totpEnabled: fresh.totpEnabled };
  }
}
