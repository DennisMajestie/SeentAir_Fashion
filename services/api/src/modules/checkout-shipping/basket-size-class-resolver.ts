import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ProductVariant } from '../catalogue/entities/product-variant.entity';
import {
  DEFAULT_SIZE_CLASS,
  ProductSizeClass,
  sizeClassRank,
  toSizeClass,
} from './shipping-size-class';

/** A basket line a resolver sees: variantId is the catalogue key, sizeClass is only a fallback hint. */
export interface BasketLineHint {
  variantId?: string | null;
  sizeClass?: string | null;
}

export const BASKET_SIZE_CLASS_RESOLVER = 'BASKET_SIZE_CLASS_RESOLVER';

/**
 * Picks the band a basket ships as. Implemented over the catalogue so clients
 * cannot name their own class: the organised answer to "how big is this" comes
 * from the product row, not from the browser.
 */
export interface BasketSizeClassResolver {
  heaviest(lines: BasketLineHint[]): Promise<ProductSizeClass>;
}

@Injectable()
export class ProductCatalogueSizeClassResolver implements BasketSizeClassResolver {
  constructor(
    @InjectRepository(ProductVariant)
    private readonly variants: Repository<ProductVariant>,
  ) {}

  /**
   * The heaviest known band wins. Known variants price from their product's
   * size_class; lines the catalogue cannot resolve (no variantId, or an id we
   * do not recognise) fall back to the hint they arrived with; an empty basket
   * resolves to the column default, medium.
   */
  async heaviest(lines: BasketLineHint[]): Promise<ProductSizeClass> {
    const ids = [
      ...new Set((lines ?? []).map((l) => l?.variantId).filter((v): v is string => !!v)),
    ];
    const bands = new Map<string, ProductSizeClass>();
    if (ids.length) {
      const rows = await this.variants.find({
        where: { id: In(ids) },
        relations: { product: true },
      });
      for (const row of rows) {
        bands.set(row.id, toSizeClass(row.product?.sizeClass));
      }
    }
    let best: ProductSizeClass | null = null;
    for (const line of lines ?? []) {
      const candidate =
        (line?.variantId ? bands.get(line.variantId) : undefined) ?? toSizeClass(line?.sizeClass);
      if (best === null || sizeClassRank(candidate) > sizeClassRank(best)) best = candidate;
    }
    return best ?? DEFAULT_SIZE_CLASS;
  }
}

export function hintFallbackResolver(): BasketSizeClassResolver {
  return {
    heaviest: async (lines: BasketLineHint[]) => {
      let best: ProductSizeClass | null = null;
      for (const line of lines ?? []) {
        const candidate = toSizeClass(line?.sizeClass);
        if (best === null || sizeClassRank(candidate) > sizeClassRank(best)) best = candidate;
      }
      return best ?? DEFAULT_SIZE_CLASS;
    },
  };
}
