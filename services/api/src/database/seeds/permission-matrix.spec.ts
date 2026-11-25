import { AccessLevel, ModuleName, RoleName } from '../../common/enums';
import { PERMISSION_MATRIX } from './permission-matrix';

describe('partner role boundary', () => {
  const partner = PERMISSION_MATRIX[RoleName.PARTNER_INVESTOR];

  it('never grants access to customer records', () => {
    expect(partner[ModuleName.CUSTOMERS] ?? AccessLevel.NONE).toBe(AccessLevel.NONE);
  });

  it('grants only the permitted summary modules', () => {
    expect(partner[ModuleName.INVENTORY]).toBe(AccessLevel.VIEW);
    expect(partner[ModuleName.ANALYTICS]).toBe(AccessLevel.VIEW);
    expect(partner[ModuleName.PARTNERS]).toBe(AccessLevel.OWN);
    expect(partner[ModuleName.RETAIL_ORDERS] ?? AccessLevel.NONE).toBe(AccessLevel.NONE);
    expect(partner[ModuleName.WHOLESALE_ORDERS] ?? AccessLevel.NONE).toBe(AccessLevel.NONE);
  });
});
