import 'reflect-metadata';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { InventoryItemType } from '../inventory-movement.entity';

/**
 * Movement ledger query. itemType is whitelisted here (previously read via
 * @Query('itemType') where the pipe's forbidNonWhitelisted check on the
 * pagination binding rejected it with 400 "property itemType should not
 * exist"). Defaults to VARIANT in the controller.
 */
export class MovementsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(InventoryItemType)
  itemType?: InventoryItemType;
}
