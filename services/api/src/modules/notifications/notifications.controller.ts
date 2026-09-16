import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { NotificationsService } from './notifications.service';

class SendNotificationDto {
  @IsUUID()
  recipientId: string;

  @IsIn(['in_platform', 'sms'])
  channel: 'in_platform' | 'sms';

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsUUID()
  relatedOrderId?: string;
}

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** Every authenticated user reads their own notifications. */
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.notificationsService.listForRecipient(
      user.id,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  /** Staff-triggered sends (system events call the service directly). */
  @Post('send')
  @RequireAccess(ModuleName.COMMUNICATION, AccessLevel.FULL)
  send(@Body() dto: SendNotificationDto) {
    const input = {
      recipientId: dto.recipientId,
      type: dto.type,
      message: dto.message,
      relatedOrderId: dto.relatedOrderId ?? null,
    };
    return dto.channel === 'sms'
      ? this.notificationsService.notifySms(input)
      : this.notificationsService.notifyInPlatform(input);
  }
}
