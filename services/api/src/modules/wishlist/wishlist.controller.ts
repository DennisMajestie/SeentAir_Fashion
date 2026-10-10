import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces';
import { WishlistService } from './wishlist.service';

class MergeWishlistDto {
  /**
   * Up to 200 ids in one call. A guest list is bounded by what a person can
   * realistically tap, and the cap stops a single request from issuing an
   * unbounded insert.
   */
  @IsArray()
  @IsUUID('4', { each: true })
  productIds: string[];
}

/**
 * The customer's own wishlist. Every route is scoped to the caller from the
 * token alone -- there is no user id in the path for a client to tamper with, so
 * one customer cannot read or edit another's list.
 */
@ApiTags('Wishlist')
@ApiBearerAuth()
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.wishlistService.listFor(user.id);
  }

  @Post('items')
  add(@CurrentUser() user: AuthenticatedUser, @Body('productId') productId: string) {
    return this.wishlistService.add(user.id, productId);
  }

  @Delete('items/:productId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.wishlistService.remove(user.id, productId);
  }

  /** Folds the guest's local wishlist into the account on sign-in. */
  @Post('merge')
  merge(@CurrentUser() user: AuthenticatedUser, @Body() dto: MergeWishlistDto) {
    return this.wishlistService.merge(user.id, dto.productIds ?? []);
  }
}