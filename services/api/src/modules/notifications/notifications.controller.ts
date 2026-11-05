import { Body, Controller, Get, Patch, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { NotificationsService } from './notifications.service';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

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
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.notificationsService.listForRecipient(
      user.id,
      pagination.page ?? 1,
      pagination.limit ?? 20,
    );
  }

  @Get('preferences')
  preferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.getPreferences(user.id);
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notificationsService.updatePreferences(user.id, dto.preferences);
  }

  @Patch(':id/read')
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.notificationsService.markRead(id, user.id);
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
