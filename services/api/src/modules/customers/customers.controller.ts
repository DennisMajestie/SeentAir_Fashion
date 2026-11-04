import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CustomersService } from './customers.service';
import { CustomerAggregate } from './dto/customer-aggregate.dto';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @RequireAccess(ModuleName.CUSTOMERS, AccessLevel.VIEW)
  findAll(
    @Query()
    pagination: { page?: number; limit?: number; kind?: string; tag?: string },
  ) {
    return this.customersService.findAll(
      pagination.page ?? 1,
      pagination.limit ?? 50,
      pagination.kind as 'stockist' | 'shopper' | undefined,
      pagination.tag as string | undefined,
    );
  }

  @Get(':id')
  @RequireAccess(ModuleName.CUSTOMERS, AccessLevel.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.findById(id);
  }

  @Get(':id/aggregate')
  @RequireAccess(ModuleName.CUSTOMERS, AccessLevel.VIEW)
  aggregate(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.aggregate(id);
  }
}
