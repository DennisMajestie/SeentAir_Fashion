import { IsIn } from 'class-validator';
import { ReviewStatus } from '../review.entity';

export class ModerateReviewDto {
  @IsIn([ReviewStatus.PUBLISHED, ReviewStatus.REJECTED])
  status: ReviewStatus.PUBLISHED | ReviewStatus.REJECTED;
}
