import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountingModule } from '../accounting/accounting.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { CustomOrdersController } from './custom-orders.controller';
import { CustomOrdersService } from './custom-orders.service';
import { CustomOrderRequest } from './entities/custom-order-request.entity';
import { Quotation } from './entities/quotation.entity';
import { SampleApproval } from './entities/sample-approval.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CustomOrderRequest, Quotation, SampleApproval]),
    UsersModule,
    AccountingModule,
    NotificationsModule,
  ],
  controllers: [CustomOrdersController],
  providers: [CustomOrdersService],
})
export class CustomOrdersModule {}
