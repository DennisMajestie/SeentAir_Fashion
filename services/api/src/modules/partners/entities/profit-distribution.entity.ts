import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../../../common/numeric.transformer';

/**
 * Quarterly profit distribution (appendix 17, confirmed):
 * 40% reinvestment / 40% dividends (owners + investors) / 20% cash reserve.
 * Dividend pool splits by shareholding: 60% founder/CEO, 40% across
 * partners by their equity percentage.
 */
@Entity('profit_distributions')
export class ProfitDistribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** e.g. '2026-Q3' */
  @Column({ unique: true })
  period: string;

  @Column({ name: 'total_profit', type: 'numeric', precision: 14, scale: 2, transformer: numericTransformer })
  totalProfit: number;

  @Column({ name: 'reinvestment_amount', type: 'numeric', precision: 14, scale: 2, transformer: numericTransformer })
  reinvestmentAmount: number;

  @Column({ name: 'dividend_pool', type: 'numeric', precision: 14, scale: 2, transformer: numericTransformer })
  dividendPool: number;

  @Column({ name: 'reserve_amount', type: 'numeric', precision: 14, scale: 2, transformer: numericTransformer })
  reserveAmount: number;

  /** { founderCeo: n, partners: [{partnerId, name, equityPercentage, amount}] } */
  @Column({ name: 'per_partner_breakdown', type: 'jsonb' })
  perPartnerBreakdown: unknown;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
