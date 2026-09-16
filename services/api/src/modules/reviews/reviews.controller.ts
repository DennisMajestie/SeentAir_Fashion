import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { CreateReviewDto } from './dto/create-review.dto';
import { ModerateReviewDto } from './dto/moderate-review.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('Reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  /** Post-delivery review by the ordering customer (ownership checked in service). */
  @Post('orders/:id/review')
  @ApiBearerAuth()
  create(
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviewsService.create(orderId, dto, user);
  }

  /** Public: published reviews on a product page. */
  @Public()
  @Get('products/:id/reviews')
  findForProduct(
    @Param('id', ParseUUIDPipe) productId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.reviewsService.findPublishedForProduct(
      productId,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  /** Moderation queue + decision (Open Question #4). */
  @Get('reviews/pending')
  @ApiBearerAuth()
  @RequireAccess(ModuleName.CATALOGUE, AccessLevel.FULL)
  findPending() {
    return this.reviewsService.findPending();
  }

  @Patch('reviews/:id/status')
  @ApiBearerAuth()
  @RequireAccess(ModuleName.CATALOGUE, AccessLevel.FULL)
  moderate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ModerateReviewDto) {
    return this.reviewsService.moderate(id, dto.status);
  }
}
