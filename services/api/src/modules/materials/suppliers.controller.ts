import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SuppliersService } from './suppliers.service';

@ApiTags('Suppliers & Vendor Directory')
@ApiBearerAuth()
@Controller('materials/suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @RequireAccess(ModuleName.RAW_MATERIALS, AccessLevel.VIEW)
  findAll() {
    return this.suppliersService.findAll();
  }

  @Get(':id')
  @RequireAccess(ModuleName.RAW_MATERIALS, AccessLevel.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliersService.findById(id);
  }

  @Post()
  @RequireAccess(ModuleName.RAW_MATERIALS, AccessLevel.FULL)
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(dto);
  }

  @Patch(':id')
  @RequireAccess(ModuleName.RAW_MATERIALS, AccessLevel.FULL)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.update(id, dto);
  }

  @Delete(':id')
  @RequireAccess(ModuleName.RAW_MATERIALS, AccessLevel.FULL)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliersService.remove(id);
  }
}