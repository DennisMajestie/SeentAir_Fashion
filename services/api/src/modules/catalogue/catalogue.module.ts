import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TechPack } from '../tech-packs/tech-pack.entity';
import { ApprovalsModule } from '../approvals/approvals.module';
import { CatalogueController } from './catalogue.controller';
import { CatalogueService } from './catalogue.service';
import { Collection } from './entities/collection.entity';
import { Product } from './entities/product.entity';
import { ProductBomItem } from './entities/product-bom-item.entity';
import { ProductVariant } from './entities/product-variant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductVariant, Collection, ProductBomItem, TechPack]),
    ApprovalsModule,
  ],
  controllers: [CatalogueController],
  providers: [CatalogueService],
  exports: [CatalogueService],
})
export class CatalogueModule {}
