import 'reflect-metadata';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { DeliveryLegStatus } from '../entities/delivery-leg.entity';

/** Whitelisted status filter for the delivery legs admin list. */
export class DeliveriesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(DeliveryLegStatus)
  status?: DeliveryLegStatus;
}
