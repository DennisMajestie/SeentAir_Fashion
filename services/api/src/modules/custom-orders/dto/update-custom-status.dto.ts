import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CustomOrderStatus } from '../entities/custom-order-request.entity';

export class UpdateCustomStatusDto {
  @IsEnum(CustomOrderStatus)
  status: CustomOrderStatus;

  @IsOptional()
  @IsString()
  note?: string;
}
