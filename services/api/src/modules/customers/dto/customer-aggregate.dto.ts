import { IsNumber, IsOptional, IsString } from 'class-validator';

export class BuyProduct {
  @IsString()
  productId: string;

  @IsString()
  name: string;

  @IsNumber()
  units: number;
}

export class CustomerAggregate {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsString()
  email: string;

  @IsString()
  @IsOptional()
  phone: string | null;

  @IsString()
  @IsOptional()
  city: string | null;

  @IsString()
  @IsOptional()
  region: string | null;

  @IsString()
  kind: string;

  @IsString()
  createdAt: string;

  /** All tags on this customer. */
  @IsString()
  @IsOptional()
  tags: string[] | null;

  @IsNumber()
  orders: number;

  @IsNumber()
  totalSpend: number;

  @IsNumber()
  monthSpend: number;

  @IsNumber()
  paidOrderCount: number;

  @IsNumber()
  averageOrderValue: number;

  @IsNumber()
  outstandingBalance: number;

  @IsString()
  @IsOptional()
  lastOrderAt: string | null;

  /** spendByMonth: [{month: "YYYY-MM", total: number}] */
  spendByMonth: { month: string; total: number }[];

  /** mostBought: [{productId, name, units}] */
  mostBought: BuyProduct[];
}
