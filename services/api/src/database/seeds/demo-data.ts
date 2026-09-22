import 'dotenv/config';
import { AppDataSource } from '../data-source';
import { Collection } from '../../modules/catalogue/entities/collection.entity';
import { Product } from '../../modules/catalogue/entities/product.entity';
import { ProductVariant, AvailabilityStatus } from '../../modules/catalogue/entities/product-variant.entity';
import {
  InventoryMovement,
  InventoryItemType,
  MovementType,
} from '../../modules/inventory/inventory-movement.entity';

interface DemoProduct {
  collection: string;
  name: string;
  description: string;
  category: string;
  basePrice: number;
  image: string;
  sizes: string[];
  colours: string[];
  skuPrefix: string;
  stockPerVariant: number;
}

const DEMO_PRODUCTS: DemoProduct[] = [
  {
    collection: 'Drop 04',
    name: 'Aba Proto Tee',
    description:
      'Architectural silhouette cut from 280GSM Aba loomed cotton. Dropped shoulder, boxy construct. Raw-edge seams, dust-resistant tailoring.',
    category: 'Tees',
    basePrice: 45000,
    image: 'assets/shop-1.jpg',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    colours: ['Black', 'Off-White'],
    skuPrefix: 'ABT',
    stockPerVariant: 40,
  },
  {
    collection: 'Drop 04',
    name: 'Utility Jogger',
    description:
      'Heavyweight French terry, tapered 30-36. Dust-resistant tailoring with a utilitarian cargo construction.',
    category: 'Bottoms',
    basePrice: 78000,
    image: 'assets/shop-2.jpg',
    sizes: ['30', '32', '34', '36'],
    colours: ['Charcoal'],
    skuPrefix: 'UTJ',
    stockPerVariant: 25,
  },
  {
    collection: 'Drop 04',
    name: 'Aba Proto Hood',
    description:
      'Aba Proto Hood in heavyweight French terry. Raw-edge seams, dust-resistant tailoring. The anchor layer of the silhouette.',
    category: 'Outerwear',
    basePrice: 92000,
    image: 'assets/shop-3.jpg',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    colours: ['Black', 'Grey'],
    skuPrefix: 'ABH',
    stockPerVariant: 30,
  },
  {
    collection: 'Studio Essentials',
    name: 'Aba Essential Crew',
    description:
      'Everyday crewneck in brushed cotton fleece. Cut in Aba, Abia State, sized for layering.',
    category: 'Knitwear',
    basePrice: 65000,
    image: 'assets/shop-5.jpg',
    sizes: ['S', 'M', 'L', 'XL'],
    colours: ['Sand', 'Black'],
    skuPrefix: 'AEC',
    stockPerVariant: 20,
  },
  {
    collection: 'Studio Essentials',
    name: 'Archive Boxy Shirt',
    description:
      'Relaxed overshirt in structured cotton twill. A versatile shell for the continental vanguard.',
    category: 'Shirts',
    basePrice: 88000,
    image: 'assets/shop-6.jpg',
    sizes: ['M', 'L', 'XL'],
    colours: ['Khaki', 'Black'],
    skuPrefix: 'ABS',
    stockPerVariant: 15,
  },
];

async function ensureDemoData(): Promise<void> {
  await AppDataSource.initialize();

  const collectionRepo = AppDataSource.getRepository(Collection);
  const productRepo = AppDataSource.getRepository(Product);
  const variantRepo = AppDataSource.getRepository(ProductVariant);
  const movementRepo = AppDataSource.getRepository(InventoryMovement);

  const existingProducts = await productRepo.count();
  if (existingProducts > 0) {
    console.log(`Demo data skipped: ${existingProducts} products already present.`);
    await AppDataSource.destroy();
    return;
  }

  const collections = new Map<string, Collection>();
  for (const p of DEMO_PRODUCTS) {
    if (!collections.has(p.collection)) {
      let collection = await collectionRepo.findOne({ where: { name: p.collection } });
      if (!collection) collection = await collectionRepo.save(collectionRepo.create({ name: p.collection }));
      collections.set(p.collection, collection);
    }
  }

  let variantCount = 0;
  let movementCount = 0;
  for (const p of DEMO_PRODUCTS) {
    const product = await productRepo.save(
      productRepo.create({
        name: p.name,
        description: p.description,
        category: p.category,
        basePrice: p.basePrice,
        collection: collections.get(p.collection)!,
      }),
    );

    // Matching storefront landing asset for the collection card, biassed to size 1.
    for (const [si, size] of p.sizes.entries()) {
      for (const [ci, colour] of p.colours.entries()) {
        const sku = `${p.skuPrefix}-${size}-${colour.replace(/[^A-Za-z]/g, '')}`;
        const variant = await variantRepo.save(
          variantRepo.create({
            product,
            size,
            colour,
            sku,
            imageUrl: ci === 0 ? p.image : null,
            availabilityStatus: AvailabilityStatus.IN_STOCK,
          }),
        );
        variantCount++;

        // Event-sourced stock: current quantity is ALWAYS derived from the ledger.
        await movementRepo.save(
          movementRepo.create({
            itemType: InventoryItemType.VARIANT,
            itemId: variant.id,
            movementType: MovementType.PRODUCTION,
            quantityDelta: si === 0 ? p.stockPerVariant : p.stockPerVariant - 5,
            referenceId: `demo-${sku}`,
          }),
        );
        movementCount++;
      }
    }
  }

  await AppDataSource.destroy();
  console.log(`Demo data complete: ${collections.size} collections, ${DEMO_PRODUCTS.length} products, ${variantCount} variants, ${movementCount} stock movements.`);
}

ensureDemoData().catch((err) => {
  console.error('Demo data failed:', err);
  process.exit(1);
});