import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HelpController } from './help.controller';
import { HelpService } from './help.service';
import { HelpTicket } from './help-ticket.entity';

@Module({
  imports: [TypeOrmModule.forFeature([HelpTicket])],
  controllers: [HelpController],
  providers: [HelpService],
})
export class HelpModule {}
