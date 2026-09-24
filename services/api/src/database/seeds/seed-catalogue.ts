import 'dotenv/config';
import { AppDataSource } from '../data-source';
import { Collection } from '../../modules/catalogue/entities/collection.entity';
import { Product } from '../../modules/catalogue/entities/product.entity';
import {
  AvailabilityStatus,
  ProductVariant,
} from '../../modules/catalogue/entities/product-variant.entity';
import {
  InventoryItemType,
  InventoryMovement,
  MovementType,
} from '../../modules/inventory/inventory-movement.entity';

/**
 * DEV CATALOGUE — demo products so every screen has something to show.
 * Not production data: Cynthia's real catalogue is entered through the
 * admin Catalogue screen. Idempotent, keyed on SKU, and safe to re-run.
 *
 * Opening stock is written as inventory movements (never a quantity
 * field) so derived stock stays the single source of truth.
 */

interface SeedVariant {
  size: string;
  colour: string;
  sku: string;
  stock: number;
  priceOverride?: number;
  availability?: AvailabilityStatus;
}

interface SeedProduct {
  name: string;
  description: string;
  category: string;
  basePrice: number;
  collection: string;
  image: string;
  variants: SeedVariant[];
}

const CLOTHING_SIZES = ['S', 'M', 'L', 'XL'];

/** Build size runs quickly: one colour, one SKU stem, per-size stock. */
function sizeRun(
  stem: string,
  colour: string,
  stockBySize: number[],
  sizes = CLOTHING_SIZES,
): SeedVariant[] {
  return sizes.map((size, i) => ({
    size,
    colour,
    sku: `${stem}-${size}`,
    stock: stockBySize[i] ?? 0,
  }));
}

const CATALOGUE: SeedProduct[] = [
  {
    name: 'Box Tee',
    description:
      '280GSM Aba-loomed cotton. Dropped shoulder, boxy construct, raw-edge neckline.',
    category: 'tops',
    basePrice: 24000,
    collection: 'Drop 04 — Harmattan',
    image: 'assets/series-2.jpg',
    variants: [
      ...sizeRun('TEE-BOX-BLK', 'black', [18, 26, 24, 12]),
      ...sizeRun('TEE-BOX-BON', 'bone', [10, 16, 14, 8]),
    ],
  },
  {
    name: 'Jogger',
    description:
      'Heavyweight French terry, tapered leg, dust-resistant tailoring for dry-season winds.',
    category: 'bottoms',
    basePrice: 38000,
    collection: 'Drop 04 — Harmattan',
    image: 'assets/series-3.jpg',
    variants: [
      ...sizeRun('JOG-UTL-CHR', 'charcoal', [14, 20, 18, 9]),
      ...sizeRun('JOG-UTL-CLY', 'clay', [8, 12, 10, 6]),
    ],
  },
  {
    name: 'Hoodie',
    description:
      'Raw-edge heavyweight terry hood. Oversized body, twin-needle shoulder, unlined pocket.',
    category: 'outerwear',
    basePrice: 52000,
    collection: 'Drop 04 — Harmattan',
    image: 'assets/series-4.jpg',
    variants: [
      ...sizeRun('HOD-PRO-ECR', 'ecru', [9, 15, 13, 7]),
      ...sizeRun('HOD-PRO-BLK', 'black', [6, 11, 10, 5]),
    ],
  },
  {
    name: 'Overshirt',
    description:
      'Structured cotton twill overshirt. Patch pockets, horn buttons, cut for layering.',
    category: 'outerwear',
    basePrice: 46000,
    collection: 'Drop 04 — Harmattan',
    image: 'assets/shop-1.jpg',
    variants: [...sizeRun('SHT-ATL-SND', 'sand', [7, 12, 11, 6])],
  },
  {
    name: 'Cargo',
    description:
      'Pattern-block cargo in washed ripstop. Bellowed thigh pocket, drawcord hem.',
    category: 'bottoms',
    basePrice: 42000,
    collection: 'Drop 04 — Harmattan',
    image: 'assets/shop-2.jpg',
    variants: [...sizeRun('CRG-CUT-OLV', 'olive', [11, 17, 15, 8])],
  },
  {
    name: 'Crewneck',
    description: 'Mid-weight loopback crew. Ribbed collar, relaxed body, garment-dyed.',
    category: 'tops',
    basePrice: 34000,
    collection: 'Studio Essentials',
    image: 'assets/shop-3.jpg',
    variants: [
      ...sizeRun('CRW-STD-GRY', 'grey melange', [13, 19, 16, 9]),
      ...sizeRun('CRW-STD-BLK', 'black', [10, 14, 12, 7]),
    ],
  },
  {
    name: 'Work Pant',
    description: 'Straight-leg cotton drill. Triple-stitched seat, factory-spec hardware.',
    category: 'bottoms',
    basePrice: 36000,
    collection: 'Studio Essentials',
    image: 'assets/shop-5.jpg',
    variants: [...sizeRun('PNT-YBA-IND', 'indigo', [9, 14, 12, 6])],
  },
  {
    name: 'Cap',
    description: 'Six-panel brushed cotton cap with woven Seentair label. One size, adjustable.',
    category: 'accessories',
    basePrice: 14000,
    collection: 'Studio Essentials',
    image: 'assets/shop-6.jpg',
    variants: [
      { size: 'OS', colour: 'black', sku: 'CAP-SIG-BLK-OS', stock: 34 },
      { size: 'OS', colour: 'bone', sku: 'CAP-SIG-BON-OS', stock: 22 },
    ],
  },
  {
    name: 'Tote',
    description: '16oz canvas tote, screen-printed spec mark. Made from drop-04 offcuts.',
    category: 'accessories',
    basePrice: 18000,
    collection: 'Studio Essentials',
    image: 'assets/shop-0.jpg',
    variants: [{ size: 'OS', colour: 'natural', sku: 'TOT-ARC-NAT-OS', stock: 41 }],
  },
  {
    name: 'Suit — Made to Order',
    description:
      'Bespoke two-piece cut to your measurements in the Aba atelier. 3-week lead time.',
    category: 'tailoring',
    basePrice: 185000,
    collection: 'Atelier Commission',
    image: 'assets/series-5.jpg',
    variants: [
      {
        size: 'Bespoke',
        colour: 'charcoal',
        sku: 'CMS-SUT-CHR-BSP',
        stock: 0,
        availability: AvailabilityStatus.MADE_TO_ORDER,
      },
    ],
  },
];

async function seedCatalogue(): Promise<void> {
  await AppDataSource.initialize();
  const collectionRepo = AppDataSource.getRepository(Collection);
  const productRepo = AppDataSource.getRepository(Product);
  const variantRepo = AppDataSource.getRepository(ProductVariant);
  const movementRepo = AppDataSource.getRepository(InventoryMovement);

  let createdProducts = 0;
  let createdVariants = 0;
  let openingMovements = 0;

  for (const spec of CATALOGUE) {
    // 1. Collection (unique by name)
    let collection = await collectionRepo.findOne({ where: { name: spec.collection } });
    if (!collection) {
      collection = await collectionRepo.save(collectionRepo.create({ name: spec.collection }));
    }

    // 2. Product (keyed on name — this seed owns these names)
    let product = await productRepo.findOne({ where: { name: spec.name } });
    if (!product) {
      product = await productRepo.save(
        productRepo.create({
          name: spec.name,
          description: spec.description,
          category: spec.category,
          basePrice: spec.basePrice,
          collection,
        }),
      );
      createdProducts++;
    }

    // 3. Variants (keyed on SKU, which is unique)
    for (const v of spec.variants) {
      const existing = await variantRepo.findOne({ where: { sku: v.sku } });
      if (existing) continue;

      const variant = await variantRepo.save(
        variantRepo.create({
          product,
          size: v.size,
          colour: v.colour,
          sku: v.sku,
          priceOverride: v.priceOverride ?? null,
          imageUrl: spec.image,
          availabilityStatus:
            v.availability ??
            (v.stock > 0 ? AvailabilityStatus.IN_STOCK : AvailabilityStatus.OUT_OF_STOCK),
        }),
      );
      createdVariants++;

      // 4. Opening stock as a ledger movement — never a quantity column.
      if (v.stock > 0) {
        await movementRepo.save(
          movementRepo.create({
            itemType: InventoryItemType.VARIANT,
            itemId: variant.id,
            movementType: MovementType.PRODUCTION,
            quantityDelta: v.stock,
            actorId: null,
            referenceId: 'seed:opening-stock',
          }),
        );
        openingMovements++;
      }
    }
  }

  const totalProducts = await productRepo.count();
  const totalVariants = await variantRepo.count();

  console.log(
    `Catalogue seed complete — created ${createdProducts} products, ` +
      `${createdVariants} variants, ${openingMovements} opening-stock movements.`,
  );
  console.log(`Catalogue now holds ${totalProducts} products / ${totalVariants} variants.`);

  await AppDataSource.destroy();
}

seedCatalogue().catch((err) => {
  console.error(err);
  process.exit(1);
});
