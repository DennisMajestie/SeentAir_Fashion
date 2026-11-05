import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { InventoryItemType } from '../inventory-movement.entity';

export class StockCountLineDto {
  @IsEnum(InventoryItemType)
  itemType: InventoryItemType;

  @IsUUID()
  itemId: string;

  @IsInt()
  @Min(0)
  countedQuantity: number;

  @IsOptional()
  @IsUUID()
  approvalRequestId?: string;
}

export class CreateStockCountDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockCountLineDto)
  items: StockCountLineDto[];
}
