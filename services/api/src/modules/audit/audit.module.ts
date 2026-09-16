import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogEntry } from './audit-log-entry.entity';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Global() // AuditService is needed by the global AuditInterceptor
@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntry])],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
