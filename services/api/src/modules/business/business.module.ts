import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { BusinessController } from './business.controller';
import { BusinessService } from './business.service';
import { BusinessProfile } from './entities/business-profile.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BusinessProfile]), AuditModule],
  controllers: [BusinessController],
  providers: [BusinessService],
  exports: [BusinessService],
})
export class BusinessModule {}
