import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../../common/interfaces';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { TotpCodeDto, Verify2faDto } from './dto/twofa.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  /** Tight per-IP throttle on credential endpoints (brute-force defense, layer 1). */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  /** Storefront self-registration — always a customer account. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  /** Step 2 of a 2FA login. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('2fa/verify')
  @HttpCode(200)
  verify2fa(@Body() dto: Verify2faDto) {
    return this.authService.verify2fa(dto.challengeToken, dto.code);
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

  /** Server-side logout: revokes every active refresh token for the caller. */
  @Post('logout')
  @HttpCode(200)
  @ApiBearerAuth()
  logout(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.logout(user.id);
  }

  @Get('me')
  @ApiBearerAuth()
  async me(@CurrentUser() user: AuthenticatedUser) {
    const fresh = await this.usersService.findById(user.id);
    return { ...user, name: fresh.name, totpEnabled: fresh.totpEnabled };
  }
}
