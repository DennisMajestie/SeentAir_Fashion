import 'dotenv/config';
import { DataSource } from 'typeorm';
import { databaseConnection } from './src/config/database-connection';
import { Customer } from './src/modules/customers/entities/customer.entity';

async function main() {
  const ds = new DataSource({ type: 'postgres', ...databaseConnection(), entities: [Customer] });
  await ds.initialize();
  
  const customers = [
    { name: 'Juniper & Moss Apothecary', kind: 'stockist', contact: 'Clara Lindqvist', email: 'clara@junipermoss.com', phone: '(896) 555-0129', city: 'Portland', region: 'OR', tags: ['vip','net30'], note: 'Reorders the balm every 4–5 weeks. Prefers UPS.' },
    { name: 'The Fern Room', kind: 'stockist', contact: 'Marcus Bell', email: 'marcus@thefern.com', phone: '(503) 555-0125', city: 'Austin', region: 'TX', tags: ['net30'], note: '' },
    { name: 'Saltwater Pharmacy', kind: 'stockist', contact: 'Aisha Rahman', email: 'aisha@saltwaterpharmacy.com', phone: '(719) 555-0133', city: 'Charleston', region: 'SC', tags: ['vip'], note: '' },
    { name: 'Amara Nwosu', kind: 'shopper', contact: 'Amara Nwosu', email: 'amara.nwosu@mail.com', phone: '(289) 555-0184', city: 'Raleigh', region: 'NC', tags: ['subscriber'], note: '' },
    { name: 'Lena Fischer', kind: 'shopper', contact: 'Lena Fischer', email: 'lena.fischer@mail.com', phone: '(207) 555-0184', city: 'Chicago', region: 'IL', tags: [], note: '' },
    { name: 'Diego Castillo', kind: 'shopper', contact: 'Diego Castillo', email: 'diego.castillo@mail.com', phone: '(563) 555-0169', city: 'Phoenix', region: 'AZ', tags: ['subscriber'], note: '' },
  ];
  
  for (const c of customers) {
    try {
      await ds.getRepository(Customer).save(c);
      console.log('Created:', c.name);
    } catch(e) {
      console.log('Error creating', c.name, ':', e.message);
    }
  }
  await ds.destroy();
  console.log('Done');
}
main().catch(e => { console.error(e); process.exit(1); });