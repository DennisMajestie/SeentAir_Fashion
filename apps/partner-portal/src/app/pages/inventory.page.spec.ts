import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PortalStore } from '../portal.store';
import { configurePortal } from '../testing';
import { InventoryPage } from './inventory.page';

describe('InventoryPage', () => {
  let fixture: ComponentFixture<InventoryPage>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  afterEach(() => fixture?.destroy());

  it('shows the audited finished-goods aggregate and unvalued money honestly', () => {
    configurePortal();
    fixture = TestBed.createComponent(InventoryPage);
    fixture.detectChanges();
    const metrics = el().querySelector('.se-metric-grid')!.textContent!;
    expect(metrics).toContain('1,148 units');
    expect(metrics).toContain('Not yet valued');
  });

  it('lists a live stock row from the event-sourced summary with a status badge', () => {
    configurePortal();
    TestBed.inject(PortalStore).inventory.set([
      { itemType: 'variant', itemId: 'v1', currentQuantity: 12, byMovementType: {} },
    ]);
    fixture = TestBed.createComponent(InventoryPage);
    fixture.detectChanges();
    const table = el().querySelectorAll('se-table')[1].textContent!;
    expect(table).toContain('Unlabelled item');
    expect(table).toContain('12');
    expect(table).toContain('In stock');
  });

  it('shows honest empty states when nothing is recorded', () => {
    configurePortal();
    fixture = TestBed.createComponent(InventoryPage);
    fixture.detectChanges();
    expect(el().textContent).toContain('No variant-level stock yet');
    expect(el().textContent).toContain('Not yet published');
  });

  it('never shows a customer name, email or address', () => {
    configurePortal();
    fixture = TestBed.createComponent(InventoryPage);
    fixture.detectChanges();
    expect(el().textContent).not.toMatch(/@|customer|address/i);
  });
});
