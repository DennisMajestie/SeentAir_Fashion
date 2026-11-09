import 'reflect-metadata';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** Whitelisted stage filter for the production batch list. */
export class ProductionQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  stage?: string;
}
