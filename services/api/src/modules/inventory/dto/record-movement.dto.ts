import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, NotEquals } from 'class-validator';
import { MovementType } from '../inventory-movement.entity';

/**
 * Manual movement (mostly `adjustment`). System flows (sale, return,
 * production) create movements internally through InventoryService.
 */
export class RecordMovementDto {
  @IsEnum(MovementType)
  movementType: MovementType;

  @IsInt()
  @NotEquals(0)
  quantityDelta: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  referenceId?: string;

  /**
   * Required when quantityDelta is negative: removing/disposing stock needs
   * an approved request (appendix 19 — unauthorized removal is impossible).
   */
  @IsOptional()
  @IsUUID()
  approvalRequestId?: string;
}
