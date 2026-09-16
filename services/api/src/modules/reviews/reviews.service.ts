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

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review) private readonly reviewRepo: Repository<Review>,
    private readonly ordersService: OrdersService,
  ) {}

  /** Reviews are tied to delivered orders, by that order's customer only. */
  async create(orderId: string, dto: CreateReviewDto, user: AuthenticatedUser): Promise<Review> {
    const order = await this.ordersService.findById(orderId, user);
    if (order.customer?.id !== user.id) {
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
        customerId: user.id,
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

  async moderate(id: string, status: ReviewStatus): Promise<Review> {
    const review = await this.reviewRepo.findOne({ where: { id } });
    if (!review) throw new NotFoundException(`Review ${id} not found`);
    review.status = status;
    return this.reviewRepo.save(review);
  }
}
