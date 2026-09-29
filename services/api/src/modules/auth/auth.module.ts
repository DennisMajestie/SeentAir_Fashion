import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { OrdersModule } from '../orders/orders.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationToken } from './email-verification-token.entity';
import { MailAdapter } from './mail.adapter';
import { PasswordResetToken } from './password-reset-token.entity';
import { RefreshToken } from './refresh-token.entity';

@Module({
  imports: [
    UsersModule,
    JwtModule.register({ global: true }),
    TypeOrmModule.forFeature([User, RefreshToken, PasswordResetToken, EmailVerificationToken]),
    // One-way: OrdersModule does not import auth, so there is no cycle. Needed
    // so verifying an address can claim the guest orders placed with it.
    OrdersModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, MailAdapter],
})
export class AuthModule {}
