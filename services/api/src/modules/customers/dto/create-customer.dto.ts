import { IsEmail, IsNotEmpty, IsOptional, IsString, IsIn } from 'class-validator';
import { CustomerKind } from '../entities/customer.entity';

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['stockist', 'shopper'])
  kind: CustomerKind;

  @IsString()
  @IsOptional()
  contact: string | null;

  @IsString()
  @IsNotEmpty()
  @IsEmail()
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
  @IsOptional()
  tags: string[] | null;

  @IsString()
  @IsOptional()
  note: string | null;
}
