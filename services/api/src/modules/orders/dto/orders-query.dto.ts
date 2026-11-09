import 'reflect-metadata';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { OrderChannel, OrderStatus } from '../entities/order.entity';

/**
 * Admin order list query. The global ValidationPipe whitelists every bound
 * query param, so the filter keys must live here or the pipe rejects them
 * (forbidNonWhitelisted).
 */
export class OrdersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OrderChannel)
  channel?: OrderChannel;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
