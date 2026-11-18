import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../../common/numeric.transformer';

export enum CampaignType {
  CAMPAIGN = 'campaign',
  PROMOTION = 'promotion',
  LOYALTY = 'loyalty',
  VISIBILITY_BOOST = 'visibility_boost',
}

/** Marketing activity (appendix 15) — campaigns, promotions, loyalty, boosts. */
@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'enum', enum: CampaignType })
  type: CampaignType;

  /** Channel/source this campaign runs on (instagram, whatsapp, tiktok, …). */
  @Column({ type: 'varchar', nullable: true })
  channel: string | null;

  @Column({
    name: 'discount_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  discountPercent: number | null;

  /** Money actually put into this campaign, for ROI (appendix 16). */
  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  spend: number;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
