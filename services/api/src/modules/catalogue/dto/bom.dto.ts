import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class BomItemDto {
  @IsUUID()
  materialId: string;

  /** Per-unit consumption of the material. */
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsString()
  note?: string;
}

/** Replaces the whole planned BOM for a variant (PUT semantics). */
export class ReplaceBomDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BomItemDto)
  items: BomItemDto[];
}