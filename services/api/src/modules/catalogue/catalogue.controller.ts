import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { CatalogueService } from './catalogue.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@ApiTags('Products & Catalogue')
@Controller()
export class CatalogueController {
  constructor(private readonly catalogueService: CatalogueService) {}

  // Public storefront reads — no auth required.
  @Public()
  @Get('products')
  findAll(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.catalogueService.findAll(parseInt(page, 10), parseInt(limit, 10));
  }

  @Public()
  @Get('products/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogueService.findById(id);
  }

  @Public()
  @Get('products/:id/variants')
  findVariants(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogueService.findVariants(id);
  }

  @Public()
  @Get('collections')
  findCollections() {
    return this.catalogueService.findCollections();
  }

  // Admin/Management writes.
  @Post('products')
  @ApiBearerAuth()
  @RequireAccess(ModuleName.CATALOGUE, AccessLevel.FULL)
  create(@Body() dto: CreateProductDto) {
    return this.catalogueService.create(dto);
  }

  @Patch('products/:id')
  @ApiBearerAuth()
  @RequireAccess(ModuleName.CATALOGUE, AccessLevel.FULL)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.catalogueService.update(id, dto);
  }

  @Post('products/:id/variants')
  @ApiBearerAuth()
  @RequireAccess(ModuleName.CATALOGUE, AccessLevel.FULL)
  createVariant(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateVariantDto) {
    return this.catalogueService.createVariant(id, dto);
  }

  @Post('collections')
  @ApiBearerAuth()
  @RequireAccess(ModuleName.CATALOGUE, AccessLevel.FULL)
  createCollection(@Body() dto: CreateCollectionDto) {
    return this.catalogueService.createCollection(dto);
  }
}
