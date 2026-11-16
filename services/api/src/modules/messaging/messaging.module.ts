import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';
import { MessagingBus } from './messaging-bus';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';

@Module({
  // User is registered locally so thread lists can resolve customer display
  // names without a round trip through UsersService per row.
  imports: [TypeOrmModule.forFeature([Conversation, Message, User]), UsersModule],
  controllers: [MessagingController],
  providers: [MessagingService, MessagingBus],
  // The realtime gateway fans conversation activity out to sockets, so the
  // orders module imports this module for the bus alone.
  exports: [MessagingService, MessagingBus],
})
export class MessagingModule {}
