import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces';
import { OrderStatus } from '../orders/entities/order.entity';
import { OrdersService } from '../orders/orders.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { Review, ReviewStatus } from './review.entity';

/** Guards the `IN (:...ids)` expansion: only well-formed uuids reach the query. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review) private readonly reviewRepo: Repository<Review>,
    private readonly ordersService: OrdersService,
  ) {}

  /**
   * Reviews are tied to delivered orders, by that order's customer only.
   * `user` is the signed-in path; `token` is the guest path (the emailed
   * tracking link), consulted only when there is no session — exactly like the
   * tracking and payment endpoints.
   */
  async create(
    orderId: string,
    dto: CreateReviewDto,
    user?: AuthenticatedUser,
    token?: string,
  ): Promise<Review> {
    const order = await this.ordersService.findById(orderId, user, token);
    if (user && order.customer?.id !== user.id) {
      throw new ForbiddenException('Only the ordering customer can review this order');
    }
    if (order.status !== OrderStatus.DELIVERED) {
      throw new ForbiddenException('Reviews are only possible after delivery');
    }
    const item = order.items.find((i) => i.variant.id === dto.variantId);
    if (!item) {
      throw new ForbiddenException('That product is not part of this order');
    }
    const existing = await this.reviewRepo.findOne({
      where: { order: { id: orderId }, variant: { id: dto.variantId } },
    });
    if (existing) throw new ConflictException('This order item is already reviewed');

    return this.reviewRepo.save(
      this.reviewRepo.create({
        order,
        variant: item.variant,
        customerId: user?.id ?? order.customer?.id ?? null,
        rating: dto.rating,
        comment: dto.comment ?? null,
        status: ReviewStatus.PENDING, // Open Question #4 — moderated by default
      }),
    );
  }

  /** Public product page: published reviews only. */
  async findPublishedForProduct(
    productId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: Review[]; total: number }> {
    const [data, total] = await this.reviewRepo.findAndCount({
      where: { variant: { product: { id: productId } }, status: ReviewStatus.PUBLISHED },
      relations: { variant: { product: true } },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async findPending(): Promise<Review[]> {
    return this.reviewRepo.find({
      where: { status: ReviewStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Average rating and review count per product, for a whole page of products in
   * one round trip.
   *
   * The shop grid and the landing rails need a rating on every card. Fetching
   * `products/:id/reviews` per card is an N+1 — one request per product, so a
   * 50-product grid fired 50 extra calls before a price was visible, each a
   * cold-start candidate on Render. This groups in the database instead.
   *
   * Only PUBLISHED reviews count, matching findPublishedForProduct exactly, so
   * a card and its product page can never disagree about a score. Products with
   * no published reviews are omitted rather than returned as zero: the caller
   * distinguishes "unrated" (which the storefront renders differently, with the
   * "reviews open after delivery" copy) from a genuine 0.
   */
  async ratingSummaries(
    productIds: string[],
  ): Promise<Array<{ productId: string; avg: number; count: number }>> {
    const ids = [...new Set(productIds)].filter((id) => UUID_PATTERN.test(id));
    if (ids.length === 0) return [];

    const rows = await this.reviewRepo
      .createQueryBuilder('review')
      .innerJoin('review.variant', 'variant')
      .select('variant.product_id', 'productId')
      .addSelect('AVG(review.rating)', 'avg')
      .addSelect('COUNT(review.id)', 'count')
      .where('variant.product_id IN (:...ids)', { ids })
      .andWhere('review.status = :status', { status: ReviewStatus.PUBLISHED })
      .groupBy('variant.product_id')
      .getRawMany<{ productId: string; avg: string; count: string }>();

    return rows.map((r) => ({
      productId: r.productId,
      avg: Number(r.avg),
      count: Number(r.count),
    }));
  }

  async moderate(id: string, status: ReviewStatus): Promise<Review> {
    const review = await this.reviewRepo.findOne({ where: { id } });
    if (!review) throw new NotFoundException(`Review ${id} not found`);
    review.status = status;
    return this.reviewRepo.save(review);
  }
}
