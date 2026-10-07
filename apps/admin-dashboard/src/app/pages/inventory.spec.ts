import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { SeConfirmService } from '@seentair/ui';
import { of, throwError } from 'rxjs';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
import { InventoryDetailPage } from './inventory-detail.page';
import { InventoryAdminPage } from './inventory.page';
import { MaterialDetailPage } from './material-detail.page';
import { MaterialsAdminPage } from './materials.page';
import { movementEntries, units } from './stock-format';
import { VendorsAdminPage } from './vendors.page';

const material = {
  id: 'm1',
  name: 'Cotton fabric',
  unit: 'yard',
  currentQuantity: 4,
  reorderThreshold: 10,
  lowStock: true,
  category: 'fabrics',
  storageLocation: 'C3-R1',
};
const supplier = {
  id: 's1',
  name: 'Aba Textile Mills',
  category: 'fabrics',
  location: 'Aba',
  certified: true,
  slaScore: 90,
  quotaUnits: 500,
  complianceNotes: null,
};
const summary = [
  { itemType: 'material', itemId: 'm1', currentQuantity: 4, byMovementType: { purchase: 10 } },
];
const movement = {
  id: 'mv1',
  movementType: 'purchase',
  quantityDelta: 10,
  timestamp: '2026-10-01T10:00:00Z',
  referenceId: null,
};

describe('stock screens', () => {
  let fixture: ComponentFixture<unknown>;
  let api: jasmine.SpyObj<ApiService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => el().textContent ?? '';

  /** Mounts a page with every read answered; `failing` names the calls that error. */
  const mount = async <T>(page: Type<T>, level = 'full', failing: string[] = []): Promise<T> => {
    const answers: Record<string, unknown> = {
      products: { data: [], total: 0 },
      materials: [material],
      material,
      lowStockMaterials: [material],
      materialsValuation: [{ id: 'm1', lastUnitCost: 200, currentValue: 800 }],
      inventorySummary: summary,
      batches: { data: [], stages: ['planned'] },
      returns: { data: [], total: 0 },
      movements: { data: [movement], total: 1, currentQuantity: 4 },
      suppliers: [supplier],
      createApproval: { id: 'a1' },
      recordMovement: {},
      recordPurchase: {},
      recordUsage: {},
      deleteSupplier: {},
    };
    api = jasmine.createSpyObj<ApiService>('ApiService', Object.keys(answers) as never);
    for (const [name, answer] of Object.entries(answers)) {
      (api as unknown as Record<string, jasmine.Spy>)[name].and.callFake(() =>
        failing.includes(name) ? throwError(() => ({ status: 500 })) : of(answer),
      );
    }
    const paramMap = convertToParamMap({ id: 'm1', itemType: 'material', itemId: 'm1' });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap, queryParamMap: convertToParamMap({}) } },
        },
      ],
    });
    TestBed.inject(AccessService).me.set({
      name: 'Test',
      email: 't@example.com',
      role: 'staff',
      totpEnabled: false,
      access: { inventory: level, raw_materials: level },
    });
    fixture = TestBed.createComponent(page);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.componentInstance as T;
  };
  const decline = (): jasmine.Spy =>
    spyOn(TestBed.inject(SeConfirmService), 'ask').and.resolveTo(false);
  afterEach(() => fixture?.destroy());

  it('writes counts and movements properly', () => {
    expect(units(1)).toBe('1 unit');
    expect(units(3)).toBe('3 units');
    expect(movementEntries([movement], 'yard')[0].text).toBe('Purchase: +10 yards');
  });

  describe('Inventory', () => {
    it('renders stock rows through the shared table', async () => {
      await mount(InventoryAdminPage);
      expect(el().querySelector('se-table')).not.toBeNull();
      expect(text()).toContain('Cotton fabric');
    });

    it('shows an error, not an empty list, when the load fails', async () => {
      await mount(InventoryAdminPage, 'full', ['inventorySummary']);
      expect(text()).toContain('Try again');
      expect(text()).not.toContain('No stock recorded yet');
    });

    it('confirms a movement as a permanent ledger entry and does nothing when declined', async () => {
      const page = await mount(InventoryDetailPage);
      const ask = decline();
      page.form = { delta: 5, reference: '' };
      await page.submit();
      expect(ask.calls.mostRecent().args[0].title).toBe(
        'Record a movement of +5 on Cotton fabric?',
      );
      expect(ask.calls.mostRecent().args[0].consequence).toContain('permanent');
      expect(api.recordMovement).not.toHaveBeenCalled();
    });

    it('asks for approval before a removal, and keeps the request body', async () => {
      const page = await mount(InventoryDetailPage);
      spyOn(TestBed.inject(SeConfirmService), 'ask').and.resolveTo(true);
      page.form = { delta: -2, reference: 'damaged' };
      await page.submit();
      expect(api.createApproval).toHaveBeenCalledWith('stock_disposal', {
        item: 'Cotton fabric',
        delta: -2,
        note: 'damaged',
      });
      expect(api.recordMovement).not.toHaveBeenCalled();
      await page.submit();
      expect(api.recordMovement).toHaveBeenCalledWith('m1', 'material', {
        movementType: 'adjustment',
        quantityDelta: -2,
        referenceId: 'damaged',
        approvalRequestId: 'a1',
      });
    });

    it('does not offer "Record movement" to a role that can only view', async () => {
      await mount(InventoryDetailPage, 'view');
      expect(text()).toContain('Movement history');
      expect(text()).not.toContain('Record movement');
    });
  });

  describe('Materials', () => {
    it('renders materials through the shared table with their stock status', async () => {
      await mount(MaterialsAdminPage);
      expect(el().querySelector('se-table')).not.toBeNull();
      expect(text()).toContain('Cotton fabric');
      expect(text()).toContain('Low stock');
    });

    it('shows an error, not an empty list, when the load fails', async () => {
      await mount(MaterialsAdminPage, 'full', ['materials']);
      expect(text()).toContain('Try again');
      expect(text()).not.toContain('No materials yet');
    });

    it('confirms a purchase request as approval-gated and does nothing when declined', async () => {
      const page = await mount(MaterialDetailPage);
      const ask = decline();
      page.pu = { ...page.pu, quantity: 50, cost: 10000 };
      await page.purchase();
      expect(ask.calls.mostRecent().args[0].title).toBe(
        'Request approval to buy 50 yards of Cotton fabric?',
      );
      expect(ask.calls.mostRecent().args[0].consequence).toContain('approval-gated');
      expect(api.createApproval).not.toHaveBeenCalled();
      expect(api.recordPurchase).not.toHaveBeenCalled();
    });

    it('hides the write actions from a role that can only view', async () => {
      await mount(MaterialsAdminPage, 'view');
      expect(text()).not.toContain('Add material');
      expect(text()).not.toContain('Request reorder approval');
      fixture.destroy();
      TestBed.resetTestingModule();
      await mount(MaterialDetailPage, 'view');
      expect(text()).not.toContain('Record purchase');
      expect(text()).not.toContain('Record usage');
    });
  });

  describe('Procurement', () => {
    it('renders suppliers through the shared table', async () => {
      await mount(VendorsAdminPage);
      expect(el().querySelector('se-table')).not.toBeNull();
      expect(text()).toContain('Aba Textile Mills');
      expect(text()).toContain('Certified');
    });

    it('shows an error, not an empty list, when the load fails', async () => {
      await mount(VendorsAdminPage, 'full', ['suppliers']);
      expect(text()).toContain('Try again');
      expect(text()).not.toContain('No suppliers yet');
    });

    it('confirms deleting a supplier by name and does nothing when declined', async () => {
      const page = await mount(VendorsAdminPage);
      const ask = decline();
      await page.deleteSupplier(supplier);
      const asked = ask.calls.mostRecent().args[0];
      expect(asked.title).toBe('Delete supplier Aba Textile Mills?');
      expect(asked.consequence).toContain('cannot be undone');
      expect(asked.danger).toBeTrue();
      expect(api.deleteSupplier).not.toHaveBeenCalled();
    });

    it('does not offer add, save or delete to a role that can only view', async () => {
      const page = await mount(VendorsAdminPage, 'view');
      page.openSupplier(supplier);
      fixture.detectChanges();
      expect(document.body.textContent).not.toContain('Add supplier');
      expect(document.body.textContent).not.toContain('Delete supplier');
      expect(document.body.textContent).not.toContain('Save supplier');
    });
  });
});
