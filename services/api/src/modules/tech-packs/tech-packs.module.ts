import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { TechPack } from './tech-pack.entity';
import { TechPackRevision } from './tech-pack-revision.entity';
import { TechPacksController } from './tech-packs.controller';
import { TechPacksService } from './tech-packs.service';

@Module({
  imports: [TypeOrmModule.forFeature([TechPack, TechPackRevision]), CatalogueModule],
  controllers: [TechPacksController],
  providers: [TechPacksService],
  exports: [TechPacksService],
})
export class TechPacksModule {}