import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { AppDataSource } from '../data-source';
import { RoleName, UserStatus } from '../../common/enums';
import { Role } from '../../modules/users/entities/role.entity';
import { User } from '../../modules/users/entities/user.entity';
import { Category } from '../../modules/catalogue/entities/category.entity';
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
import {
  Order,
  OrderChannel,
  OrderStatus,
  PaymentStatus,
} from '../../modules/orders/entities/order.entity';
import { OrderItem } from '../../modules/orders/entities/order-item.entity';
import { Review, ReviewStatus } from '../../modules/reviews/review.entity';

/**
 * DEV CATALOGUE — demo products so every screen has something to show.
 * Not production data: Cynthia's real catalogue is entered through the
 * admin Catalogue screen. Idempotent, keyed on SKU, and safe to re-run.
 *
 * Opening stock is written as inventory movements (never a quantity
 * field) so derived stock stays the single source of truth.
 *
 * The second block below is the home-page reference line. Everything the
 * screenshot shows (names, the ₦5,000 price point, five-star ratings, the
 * audience/garment type) is SOURCE data; anything the screenshot leaves out
 * (stock, a working second price for the polo, a couple of extra reference
 * photos) is a DEV DEFAULT and is clearly marked as such in the comments.
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
  /**
   * Bundled photo for the product (`public/assets/...`). Seeds BOTH
   * `products.primary_image_url` and every variant's `image_url` — this dev
   * catalogue is one photo per product. Re-runs only overwrite a value that
   * is null or still points at a bundled `assets/` file, so an admin upload
   * (absolute URL) is never clobbered.
   */
  primaryImage: string;
  variants: SeedVariant[];
  /** Explicit identity SKU (must equal the first variant's SKU). Kept on the
   *  reference line so its four "Men 2-Piece Set"s are distinguishable in the
   *  data itself; every other product falls back to variants[0].sku. */
  skuKey?: string;
  /** Seller-applied Best Seller label (products.is_bestseller). */
  isBestseller?: boolean;
  /** Explicit createdAt so which three products are "New Arrivals" is
   *  deterministic rather than whatever millisecond the insert happened. */
  createdAt?: Date;
  /**
   * When set, one PUBLISHED N-star review is created, backed by one dev
   * delivered/paid order for the product, so the five-star ratings shown in
   * the reference render as real data instead of an invented figure. The
   * reference's numeric counts (124, 96, ...) cannot exist honestly in this
   * schema — reviews are per-order records and the storefront counts rows —
   * so we reproduce the visible five stars without fabricating 124 orders.
   */
  reviewStars?: number;
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

/** Dev stock per reference item — the screenshot gives no quantities. */
const REF_STOCK = 50;

const CATALOGUE: SeedProduct[] = [
  {
    name: 'Box Tee',
    description: '280GSM Aba-loomed cotton. Dropped shoulder, boxy construct, raw-edge neckline.',
    category: 'tops',
    basePrice: 24000,
    collection: 'Drop 04 — Harmattan',
    primaryImage: 'assets/series-2.jpg',
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
    primaryImage: 'assets/series-3.jpg',
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
    primaryImage: 'assets/series-4.jpg',
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
    primaryImage: 'assets/shop-1.jpg',
    variants: [...sizeRun('SHT-ATL-SND', 'sand', [7, 12, 11, 6])],
  },
  {
    name: 'Cargo',
    description: 'Pattern-block cargo in washed ripstop. Bellowed thigh pocket, drawcord hem.',
    category: 'bottoms',
    basePrice: 42000,
    collection: 'Drop 04 — Harmattan',
    primaryImage: 'assets/shop-2.jpg',
    variants: [...sizeRun('CRG-CUT-OLV', 'olive', [11, 17, 15, 8])],
  },
  {
    name: 'Crewneck',
    description: 'Mid-weight loopback crew. Ribbed collar, relaxed body, garment-dyed.',
    category: 'tops',
    basePrice: 34000,
    collection: 'Studio Essentials',
    primaryImage: 'assets/shop-3.jpg',
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
    primaryImage: 'assets/shop-5.jpg',
    variants: [...sizeRun('PNT-YBA-IND', 'indigo', [9, 14, 12, 6])],
  },
  {
    name: 'Cap',
    description: 'Six-panel brushed cotton cap with woven Seentair label. One size, adjustable.',
    category: 'accessories',
    basePrice: 14000,
    collection: 'Studio Essentials',
    primaryImage: 'assets/shop-6.jpg',
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
    primaryImage: 'assets/shop-0.jpg',
    variants: [{ size: 'OS', colour: 'natural', sku: 'TOT-ARC-NAT-OS', stock: 41 }],
  },
  {
    name: 'Suit — Made to Order',
    description: 'Bespoke two-piece cut to your measurements in the Aba atelier. 3-week lead time.',
    category: 'tailoring',
    basePrice: 185000,
    collection: 'Atelier Commission',
    primaryImage: 'assets/series-5.jpg',
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

/**
 * The home-reference line from the approved storefront design. Names, the
 * ₦5,000 price, five-star ratings and the garment-type categories come from
 * the reference screenshot. Everything in DEV comments below is a
 * development default (stock, one-size variant, the white polo's price).
 *
 * IMAGE MAPPING: product_01..09.png are the reference photos, assumed to be
 * in the screenshot's display order (brown 2-pc → 01, white/black 2-pc → 02,
 * black tee → 03, brown underwear → 04, beige 2-pc → 05, black/gold 2-pc →
 * 06, children's pink set → 07, black underwear → 08, white polo → 09). If
 * any swap is needed, edit the `primaryImage` values here — nothing else
 * depends on the file names.
 *
 * CATEGORY MODEL: the schema has no categories table; `Product.category` is a
 * flat string and the storefront derives its pills from the values present,
 * exactly as the reference's shop pills read (2-Piece Sets, T-Shirts, …).
 * There is no parent/child, so "Men" itself is not a row — each product
 * carries its full leaf. "All" stays a frontend pill (`category === null`).
 */
function refArrival(hoursAgo: number): Date {
  return new Date(Date.now() - hoursAgo * 3_600_000);
}

/**
 * The seed only owns an image while the row still points at a bundled
 * `assets/...` file or has none at all (null). Anything else — an absolute
 * URL written by the admin uploader — belongs to the seller and is never
 * overwritten on a re-run.
 */
function seedMaySetImage(current: string | null): boolean {
  return current === null || current.startsWith('assets/');
}

const REFERENCE_ITEMS: SeedProduct[] = [
  {
    name: 'Men 2-Piece Set',
    description: "Men's two-piece set: coordinated short-sleeve top, matching trousers.",
    category: '2-Piece Sets',
    basePrice: 5000, // SOURCE: ₦5,000
    collection: 'New In',
    primaryImage: 'assets/products/product_01.png', // ASSUMED: brown outfit
    skuKey: 'SE-2PC-BRN-OS',
    createdAt: refArrival(0), // New Arrival 1 (brown, 5★ · 124)
    reviewStars: 5,
    variants: [{ size: 'OS', colour: 'brown', sku: 'SE-2PC-BRN-OS', stock: REF_STOCK }],
  },
  {
    name: 'Men 2-Piece Set',
    description: "Men's two-piece set: coordinated polo-style top, matching trousers.",
    category: '2-Piece Sets',
    basePrice: 5000, // SOURCE: ₦5,000
    collection: 'New In',
    primaryImage: 'assets/products/product_02.png', // ASSUMED: white/black outfit
    skuKey: 'SE-2PC-WHBL-OS',
    createdAt: refArrival(72), // 5★ · 96
    reviewStars: 5,
    variants: [{ size: 'OS', colour: 'white/black', sku: 'SE-2PC-WHBL-OS', stock: REF_STOCK }],
  },
  {
    name: 'Men T-Shirt',
    description: "Men's T-shirt.",
    category: 'T-Shirts',
    basePrice: 5000, // SOURCE: ₦5,000
    collection: 'New In',
    primaryImage: 'assets/products/product_03.png', // ASSUMED: black tee
    skuKey: 'SE-TEE-BLK-OS',
    isBestseller: true, // Best Seller 3 (black tee)
    createdAt: refArrival(72), // 5★ · 88
    reviewStars: 5,
    variants: [{ size: 'OS', colour: 'black', sku: 'SE-TEE-BLK-OS', stock: REF_STOCK }],
  },
  {
    name: 'Men Underwear',
    description: "Men's underwear with contrast waistband.",
    category: 'Underwear',
    basePrice: 5000, // SOURCE: ₦5,000
    collection: 'New In',
    primaryImage: 'assets/products/product_04.png', // ASSUMED: brown, black waistband
    skuKey: 'SE-UNW-BRN-OS',
    isBestseller: true, // Best Seller 4 (brown underwear)
    createdAt: refArrival(72), // 5★ · 110
    reviewStars: 5,
    variants: [{ size: 'OS', colour: 'brown', sku: 'SE-UNW-BRN-OS', stock: REF_STOCK }],
  },
  {
    name: 'Men 2-Piece Set',
    description: "Men's two-piece set: coordinated short-sleeve top, matching trousers.",
    category: '2-Piece Sets',
    basePrice: 5000, // SOURCE: ₦5,000
    collection: 'New In',
    primaryImage: 'assets/products/product_05.png', // ASSUMED: beige outfit
    skuKey: 'SE-2PC-BGE-OS',
    isBestseller: true, // Best Seller 2 (beige outfit)
    createdAt: refArrival(72), // no rating in the reference
    variants: [{ size: 'OS', colour: 'beige', sku: 'SE-2PC-BGE-OS', stock: REF_STOCK }],
  },
  {
    name: 'Men 2-Piece Set',
    description: "Men's two-piece set: coordinated top with gold trim, matching trousers.",
    category: '2-Piece Sets',
    basePrice: 5000, // SOURCE: ₦5,000
    collection: 'New In',
    primaryImage: 'assets/products/product_06.png', // ASSUMED: black/gold outfit
    skuKey: 'SE-2PC-BLG-OS',
    createdAt: refArrival(72), // no rating in the reference
    variants: [{ size: 'OS', colour: 'black/gold', sku: 'SE-2PC-BLG-OS', stock: REF_STOCK }],
  },
  {
    name: 'Children 2-Piece Set',
    description: "Children's two-piece set: top with matching skirt.",
    category: 'Children 2-Piece Sets',
    basePrice: 5000, // SOURCE: ₦5,000
    collection: 'New In',
    primaryImage: 'assets/products/product_07.png', // ASSUMED: pink children's set
    skuKey: 'SE-KID2PC-PNK-OS',
    createdAt: refArrival(1), // New Arrival 2 (pink, 5★ · 98)
    reviewStars: 5,
    variants: [{ size: 'OS', colour: 'pink', sku: 'SE-KID2PC-PNK-OS', stock: REF_STOCK }],
  },
  {
    name: 'Men Underwear',
    description: "Men's underwear with contrast waistband.",
    category: 'Underwear',
    basePrice: 5000, // SOURCE: ₦5,000
    collection: 'New In',
    primaryImage: 'assets/products/product_08.png', // ASSUMED: black underwear (New Arrival 3)
    skuKey: 'SE-UNW-BLK-OS',
    createdAt: refArrival(2), // New Arrival 3 (5★ · 76)
    reviewStars: 5,
    variants: [{ size: 'OS', colour: 'black', sku: 'SE-UNW-BLK-OS', stock: REF_STOCK }],
  },
  {
    name: 'Men Polo',
    description: "Men's polo shirt.",
    category: 'Polo',
    basePrice: 5000, // DEV DEFAULT: screenshot gives no price for Best Seller 1
    collection: 'New In',
    primaryImage: 'assets/products/product_09.png', // ASSUMED: white polo (Best Seller 1)
    skuKey: 'SE-POL-WHT-OS',
    isBestseller: true, // Best Seller 1 (white polo)
    createdAt: refArrival(72), // no rating in the reference
    variants: [{ size: 'OS', colour: 'white', sku: 'SE-POL-WHT-OS', stock: REF_STOCK }],
  },
];

const REFERENCE_SOURCE = 'seed:reference-ratings';

/** The seed grows four SHARED variables; the derived counting below reads them. */
async function seedCatalogue(): Promise<void> {
  await AppDataSource.initialize();
  const collectionRepo = AppDataSource.getRepository(Collection);
  const categoryRepo = AppDataSource.getRepository(Category);
  const productRepo = AppDataSource.getRepository(Product);
  const variantRepo = AppDataSource.getRepository(ProductVariant);
  const movementRepo = AppDataSource.getRepository(InventoryMovement);

  let createdProducts = 0;
  let createdVariants = 0;
  let openingMovements = 0;
  let bestSellerFlags = 0;
  let createdCategories = 0;
  let syncedImages = 0;

  // Products reference categories by name, so make sure each one exists in the
  // categories list first — otherwise the seeded catalog would carry values the
  // admin dropdown does not offer.
  const categoryCache = new Map<string, string>();
  const ensureCategory = async (name: string): Promise<string> => {
    const trimmed = name.trim();
    const key = trimmed.toLowerCase();
    const cached = categoryCache.get(key);
    if (cached) return cached;
    let category = await categoryRepo
      .createQueryBuilder('c')
      .where('LOWER(c.name) = LOWER(:name)', { name: trimmed })
      .getOne();
    if (!category) {
      category = await categoryRepo.save(categoryRepo.create({ name: trimmed }));
      createdCategories++;
    }
    categoryCache.set(key, category.name);
    return category.name;
  };

  const seeded = [...CATALOGUE, ...REFERENCE_ITEMS];

  for (const spec of seeded) {
    // 1. Collection (unique by name)
    let collection = await collectionRepo.findOne({ where: { name: spec.collection } });
    if (!collection) {
      collection = await collectionRepo.save(collectionRepo.create({ name: spec.collection }));
    }

    // 2. Product — identity is ALWAYS a variant SKU (skuKey when declared,
    //    otherwise the first variant's SKU), never the display name: four
    //    reference items are all "Men 2-Piece Set", and a re-run must land on
    //    the exact same row that an earlier run created.
    const identitySku = spec.skuKey ?? spec.variants[0].sku;
    let product = await productRepo
      .createQueryBuilder('p')
      .innerJoin('p.variants', 'v', 'v.sku = :sku', { sku: identitySku })
      .getOne();
    if (!product) {
      product = await productRepo.save(
        productRepo.create({
          name: spec.name,
          description: spec.description,
          category: await ensureCategory(spec.category),
          basePrice: spec.basePrice,
          collection,
          isBestseller: spec.isBestseller ?? false,
          primaryImageUrl: spec.primaryImage,
          createdAt: spec.createdAt,
        }),
      );
      createdProducts++;
    } else {
      if (spec.isBestseller && !product.isBestseller) {
        product.isBestseller = true;
        await productRepo.save(product);
        bestSellerFlags++;
      }
      // Re-run photo sync: a bundled asset or a missing photo is the seed's
      // to write; an admin-uploaded URL is left alone.
      if (
        seedMaySetImage(product.primaryImageUrl) &&
        product.primaryImageUrl !== spec.primaryImage
      ) {
        product.primaryImageUrl = spec.primaryImage;
        await productRepo.save(product);
        syncedImages++;
      }
    }

    // 3. Variants (keyed on SKU, which is unique)
    for (const v of spec.variants) {
      const existing = await variantRepo.findOne({ where: { sku: v.sku } });
      if (existing) {
        if (seedMaySetImage(existing.imageUrl) && existing.imageUrl !== spec.primaryImage) {
          existing.imageUrl = spec.primaryImage;
          await variantRepo.save(existing);
          syncedImages++;
        }
        continue;
      }

      const variant = await variantRepo.save(
        variantRepo.create({
          product,
          size: v.size,
          colour: v.colour,
          sku: v.sku,
          priceOverride: v.priceOverride ?? null,
          imageUrl: spec.primaryImage,
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

  const ratingCounts = await ensureDevRatings(productRepo, variantRepo);

  const totalProducts = await productRepo.count();
  const totalVariants = await variantRepo.count();

  console.log(
    `Catalogue seed complete — created ${createdProducts} products, ` +
      `${createdVariants} variants, ${openingMovements} opening-stock movements.`,
  );
  if (bestSellerFlags > 0) console.log(`Best-seller flags newly applied: ${bestSellerFlags}.`);
  if (createdCategories > 0) console.log(`Categories newly created: ${createdCategories}.`);
  if (syncedImages > 0)
    console.log(`Product/variant photos re-synced to bundled assets: ${syncedImages}.`);
  console.log(
    `Reference ratings: ${ratingCounts.orders} dev orders, ${ratingCounts.reviews} published reviews.`,
  );
  console.log(`Catalogue now holds ${totalProducts} products / ${totalVariants} variants.`);

  await AppDataSource.destroy();
}

/**
 * The reference shows five stars on six of the home products. Ratings in this
 * app are not a column: they are the average of PUBLISHED Review rows, and the
 * storefront counts those rows. To reproduce the visible five stars honestly
 * (rather than fake 124 orders), one dev delivered/paid order per rated
 * product powers one published 5★ review. Idempotent: orders carry
 * source='seed:reference-ratings' and reviews are unique per (order, variant).
 */
async function ensureDevRatings(
  productRepo: ReturnType<typeof AppDataSource.getRepository<Product>>,
  variantRepo: ReturnType<typeof AppDataSource.getRepository<ProductVariant>>,
): Promise<{ orders: number; reviews: number }> {
  const userRepo = AppDataSource.getRepository(User);
  const roleRepo = AppDataSource.getRepository(Role);
  const orderRepo = AppDataSource.getRepository(Order);
  const orderItemRepo = AppDataSource.getRepository(OrderItem);
  const reviewRepo = AppDataSource.getRepository(Review);

  const specBySku = new Map(REFERENCE_ITEMS.map((s) => [s.skuKey, s] as const));

  let customer = await userRepo.findOne({ where: { email: 'customer@seentair.test' } });
  if (!customer) {
    const role = await roleRepo.findOne({ where: { name: RoleName.CUSTOMER } });
    if (!role) throw new Error('CUSTOMER role missing — run `npm run seed` first');
    customer = await userRepo.save(
      userRepo.create({
        name: 'Test Customer',
        email: 'customer@seentair.test',
        passwordHash: await bcrypt.hash(process.env.SEED_USER_PASSWORD ?? 'Password123!', 10),
        role,
        status: UserStatus.ACTIVE,
      }),
    );
  }

  let orders = 0;
  let reviews = 0;

  for (const [sku, spec] of specBySku) {
    if (!spec.reviewStars) continue;

    const variant = await variantRepo.findOne({ where: { sku } });
    if (!variant) {
      console.warn(`Reference rating skipped: variant ${sku} is missing.`);
      continue;
    }

    let order = await orderRepo
      .createQueryBuilder('o')
      .innerJoin('o.items', 'oi')
      .innerJoin('oi.variant', 'v')
      .where('o.source = :marker', { marker: REFERENCE_SOURCE })
      .andWhere('v.sku = :sku', { sku })
      .getOne();

    if (!order) {
      order = await orderRepo.save(
        orderRepo.create({
          customer,
          channel: OrderChannel.RETAIL,
          status: OrderStatus.DELIVERED,
          paymentStatus: PaymentStatus.PAID,
          totalAmount: spec.basePrice,
          source: REFERENCE_SOURCE,
          deliveredAt: new Date(),
        }),
      );
      await orderItemRepo.save(
        orderItemRepo.create({
          order,
          variant,
          quantity: 1,
          unitPrice: spec.basePrice,
        }),
      );
      orders++;
    }

    const review = await reviewRepo.findOne({
      where: { order: { id: order.id }, variant: { id: variant.id } },
    });
    if (!review) {
      await reviewRepo.save(
        reviewRepo.create({
          order,
          variant,
          customerId: customer.id,
          rating: spec.reviewStars,
          comment: null,
          status: ReviewStatus.PUBLISHED,
        }),
      );
      reviews++;
    }
  }

  return { orders, reviews };
}

seedCatalogue().catch((err) => {
  console.error(err);
  process.exit(1);
});