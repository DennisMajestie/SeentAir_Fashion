import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DeliveryLegStatus } from '../entities/delivery-leg.entity';

export class UpdateDeliveryStatusDto {
  @IsEnum(DeliveryLegStatus)
  status: DeliveryLegStatus;

  @IsOptional()
  @IsString()
  trackingRef?: string;
}
