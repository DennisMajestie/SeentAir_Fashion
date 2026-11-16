import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Headers,
  HttpCode,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OptionalAuth } from '../../common/decorators/optional-auth.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import {
  ConversationsQueryDto,
  CreateConversationDto,
  CreateGuestConversationDto,
} from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { MessagingService } from './messaging.service';

/**
 * Guests authenticate with the one-time token they received when the
 * conversation was created, sent as `X-Guest-Token`.
 */
@ApiTags('Messaging')
@Controller('messaging')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  private guestToken(header?: string): string | undefined {
    return header && header.length > 0 ? header : undefined;
  }

  /** Signed-in customer (or staff) opens a thread with a first message. */
  @Post('conversations')
  @HttpCode(201)
  createOwn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateConversationDto,
  ) {
    return this.messaging.createOwnConversation(user, dto);
  }

  @Post('conversations/mine')
  @HttpCode(200)
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.messaging.listMine(user);
  }

  /** Guest path for pre-sale questions — returns the plaintext token once. */
  @Post('guest/conversations')
  @HttpCode(201)
  @Public()
  createGuest(@Body() dto: CreateGuestConversationDto) {
    return this.messaging.createGuestConversation(dto);
  }

  /** Staff inbox: every thread, filtered. */
  @Get('threads')
  @RequireAccess(ModuleName.COMMUNICATION, AccessLevel.VIEW)
  threads(@Query() query: ConversationsQueryDto) {
    return this.messaging.listForStaff(query);
  }

  /** Badge count for the admin nav. */
  @Get('unread')
  @RequireAccess(ModuleName.COMMUNICATION, AccessLevel.VIEW)
  unread() {
    return this.messaging.unreadForStaff().then((count) => ({ count }));
  }

  /** One thread + messages; staff, owner customer or guest token. */
  @Get('conversations/:id')
  @OptionalAuth()
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: AuthenticatedUser,
    @Headers('x-guest-token') guestToken?: string,
  ) {
    return this.messaging.getDetail(id, user, this.guestToken(guestToken));
  }

  /** Staff reply. */
  @Post('threads/:id/messages')
  @RequireAccess(ModuleName.COMMUNICATION, AccessLevel.FULL)
  reply(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendMessageDto,
  ) {
    return this.messaging.sendStaffMessage(id, dto, user);
  }

  /** Customer or guest reply. */
  @Post('conversations/:id/messages')
  @OptionalAuth()
  send(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: AuthenticatedUser,
    @Body() dto?: SendMessageDto,
    @Headers('x-guest-token') guestToken?: string,
  ) {
    return this.messaging.sendCustomerMessage(
      id,
      dto as SendMessageDto,
      user,
      this.guestToken(guestToken),
    );
  }

  /** Staff marks the thread read (unreadStaff -> 0). */
  @Post('threads/:id/read')
  @RequireAccess(ModuleName.COMMUNICATION, AccessLevel.VIEW)
  @HttpCode(200)
  readStaff(@Param('id', ParseUUIDPipe) id: string) {
    return this.messaging.markReadByStaff(id).then(() => ({ ok: true }));
  }

  /** Customer or guest marks the thread read (unreadCustomer -> 0). */
  @Post('conversations/:id/read')
  @OptionalAuth()
  readCustomer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: AuthenticatedUser,
    @Headers('x-guest-token') guestToken?: string,
  ) {
    return this.messaging
      .markReadByCustomer(id, user, this.guestToken(guestToken))
      .then(() => ({ ok: true }));
  }

  /** Close, reopen, assign — staff only. */
  @Patch('threads/:id')
  @RequireAccess(ModuleName.COMMUNICATION, AccessLevel.FULL)
  updateThread(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConversationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.messaging.update(id, dto, user.id);
  }
}
