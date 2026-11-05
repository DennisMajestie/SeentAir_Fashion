import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class BestSellersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['best', 'slow'])
  direction?: 'best' | 'slow';
}
