import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A product category: the controlled list behind the admin's category dropdown.
 *
 * `Product.category` stays a plain string (the storefront reads it as one), but
 * every write is checked against this table, so the catalogue can no longer
 * grow near-duplicate categories ("Tees", "tees", "Tee ") from free text. New
 * categories are created explicitly, which is what lets a brand-new line be
 * added before its first product exists.
 */
@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
