import 'dotenv/config';
import { DataSource } from 'typeorm';
import { databaseConnection } from '../config/database-connection';

/** CLI data source for migrations and seeds (reads .env). Connection
    details come from the same resolver the running app uses. */
export const AppDataSource = new DataSource({
  type: 'postgres',
  ...databaseConnection(),
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
