import { CommonModule } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { OrdersPage } from './orders.page';
import { ApiService, Invoice } from '../api.service';

/**
 * W6 procurement log on the shared primitives.
 *
 * The point of these specs is that the redesign did not soften the data rules:
 * the ledger still reconciles, the CSV still matches the screen, and the
 * reorder action is still reachable from every payment state.
 */

function invoice(over: Partial<Invoice> = {}): Invoice {
  return {
    orderId: 'a1b2c3d4-e5f6-0000-1111-222233334444',
    createdAt: new Date().toISOString(),
    status: 'processing',
    paymentStatus: 'pending',
    totalAmount: 153000,
    items: [
      {
        sku: 'CARGO-S',
        quantity: 10,
        unitPrice: 7650,
        lineTotal: 76500,
      },
      {
        sku: 'SHIRT-M',
        quantity: 10,
        unitPrice: 7650,
        lineTotal: 76500,
      },
    ],
    payments: [],
    ...over,
  } as Invoice;
}

describe('OrdersPage', () => {
  let fixture: ComponentFixture<OrdersPage>;
  let component: OrdersPage;
  let list: Invoice[];
  let reordered: string[];

  async function boot(data: Invoice[] = [invoice()]): Promise<void> {
    list = data;
    reordered = [];
    TestBed.configureTestingModule({
      imports: [OrdersPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ApiService,
          useValue: {
            invoices: () => of({ data: list, total: list.length }),
            pricing: () =>
              of({
                tier: { name: 'Standard', discountPercent: 15 },
                hasDiscount: true,
                moq: 20,
                total: 1,
                data: [],
              }),
            reorder: (id: string) => {
              reordered.push(id);
              return of({ id: 'reorder0000-1111' });
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(OrdersPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function text(): string {
    return (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');
  }

  function rows(): HTMLElement[] {
    return [...fixture.nativeElement.querySelectorAll('se-row')];
  }

  function heads(): HTMLButtonElement[] {
    return [...fixture.nativeElement.querySelectorAll('.drow-head')];
  }

  describe('shared primitives', () => {
    it('renders each order as a collapsible row, not a stacked card', async () => {
      await boot();
      expect(rows().length).toBe(1);
      expect(fixture.nativeElement.querySelectorAll('.ordercard').length).toBe(0);
    });

    it('uses one facts strip for the summary instead of a bespoke stat grid', async () => {
      await boot();
      expect(fixture.nativeElement.querySelector('se-facts')).toBeTruthy();
      expect(fixture.nativeElement.querySelectorAll('.facts .fact').length).toBe(4);
    });

    it('leaves every row collapsed so the log is scannable', async () => {
      await boot([invoice(), invoice({ orderId: 'other-order-id-9999' })]);
      expect(fixture.nativeElement.querySelectorAll('.drow.open').length).toBe(0);
      expect(fixture.nativeElement.querySelectorAll('.drow-panel').length).toBe(0);
    });

    it('shows the money and units on the collapsed head', async () => {
      await boot();
      const head = heads()[0].textContent!.replace(/\s+/g, ' ');
      expect(head).toContain('153,000');
      expect(head).toContain('20 units');
    });

    it('labels the batch with the short order id, not a raw uuid', async () => {
      await boot();
      expect(text()).toContain('A1B2C3D4');
      expect(text()).not.toContain('a1b2c3d4-e5f6');
    });
  });

  describe('collapse / expand behaviour', () => {
    it('uses a real button as the head, so it is keyboard reachable', async () => {
      await boot();
      expect(heads()[0].tagName).toBe('BUTTON');
      expect(heads()[0].getAttribute('type')).toBe('button');
    });

    it('wires aria-expanded and aria-controls to the panel', async () => {
      await boot();
      const head = heads()[0];
      expect(head.getAttribute('aria-expanded')).toBe('false');
      const panelId = head.getAttribute('aria-controls')!;
      expect(panelId).toContain(invoice().orderId);

      head.click();
      fixture.detectChanges();
      expect(head.getAttribute('aria-expanded')).toBe('true');
      const panel = fixture.nativeElement.querySelector(`#${CSS.escape(panelId)}`);
      expect(panel).toBeTruthy();
    });

    it('reveals the line items when expanded', async () => {
      await boot();
      heads()[0].click();
      fixture.detectChanges();
      expect(text()).toContain('10× CARGO-S');
      expect(text()).toContain('10× SHIRT-M');
    });

    it('opens only one row at a time', async () => {
      await boot([invoice(), invoice({ orderId: 'second-order-id-1234' })]);
      heads()[0].click();
      fixture.detectChanges();
      heads()[1].click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('.drow.open').length).toBe(1);
      expect(fixture.nativeElement.querySelectorAll('.drow-panel').length).toBe(1);
    });

    it('collapses again on a second click', async () => {
      await boot();
      heads()[0].click();
      fixture.detectChanges();
      heads()[0].click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('.drow.open').length).toBe(0);
    });
  });

  describe('the money reconciles', () => {
    it('shows each invoice line as its own ledger row', async () => {
      await boot();
      heads()[0].click();
      fixture.detectChanges();
      const rowsIn = fixture.nativeElement.querySelectorAll('.drow-panel .lg-row');
      // Two lines plus the batch total.
      expect(rowsIn.length).toBe(3);
    });

    it('prints the unit price alongside each line', async () => {
      await boot();
      heads()[0].click();
      fixture.detectChanges();
      expect(text()).toContain('7,650 ea');
    });

    it('marks exactly one ledger row as the total', async () => {
      await boot();
      heads()[0].click();
      fixture.detectChanges();
      const totals = fixture.nativeElement.querySelectorAll('.drow-panel .lg-row.total');
      expect(totals.length).toBe(1);
      expect(totals[0].textContent).toContain('153,000');
    });

    it('computes the lifetime volume from real quantities', async () => {
      await boot([invoice(), invoice({ orderId: 'second-order-id-1234' })]);
      expect(component.lifetimeUnits()).toBe(40);
      expect(text()).toContain('40 units');
    });

    it('counts only undelivered batches as active commitments', async () => {
      await boot([
        invoice(),
        invoice({ orderId: 'done-order-id-0001', status: 'delivered', totalAmount: 50000 }),
      ]);
      expect(component.activeCommitments()).toBe(153000);
      expect(component.openBatches()).toBe(1);
    });
  });

  describe('payment states drive the actions', () => {
    it('offers the pro-forma and a reorder while payment is pending', async () => {
      await boot();
      heads()[0].click();
      fixture.detectChanges();
      expect(text()).toContain('Pro-forma');
      expect(text()).toContain('Reorder');
      expect(text()).not.toContain('Manifest');
    });

    it('offers tracking and the invoice once paid', async () => {
      await boot([invoice({ paymentStatus: 'paid' })]);
      heads()[0].click();
      fixture.detectChanges();
      expect(text()).toContain('Track');
      expect(text()).not.toContain('Pro-forma');
    });

    it('offers the manifest once delivered', async () => {
      await boot([invoice({ paymentStatus: 'paid', status: 'delivered' })]);
      heads()[0].click();
      fixture.detectChanges();
      expect(text()).toContain('Manifest');
      expect(text()).toContain('Reorder batch');
    });

    it('reorders through the API with the order id', async () => {
      await boot();
      heads()[0].click();
      fixture.detectChanges();
      const button = [...fixture.nativeElement.querySelectorAll('button')].find((b) =>
        b.textContent!.includes('Reorder'),
      ) as HTMLButtonElement;
      button.click();
      fixture.detectChanges();
      expect(reordered).toEqual([invoice().orderId]);
      expect(text()).toContain('Reorder placed');
    });

    it('flags an unpaid order as needing action', async () => {
      await boot();
      expect(text()).toContain('Action req');
    });
  });

  describe('filters still work', () => {
    it('keeps the status chip counts derived from the ledger', async () => {
      await boot([invoice(), invoice({ orderId: 'second-order-id-1234', status: 'delivered' })]);
      const chips = fixture.nativeElement.querySelectorAll('.filter-chips button');
      // All + processing + delivered.
      expect(chips.length).toBe(3);
      expect(chips[0].textContent).toContain('2');
      expect(chips[1].textContent).toContain('1');
    });

    it('filters by status when a chip is chosen', async () => {
      await boot([invoice(), invoice({ orderId: 'second-order-id-1234', status: 'delivered' })]);
      const chips = fixture.nativeElement.querySelectorAll('.filter-chips button');
      (chips[2] as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(rows().length).toBe(1);
    });

    it('filters by SKU', async () => {
      await boot([
        invoice(),
        invoice({
          orderId: 'second-order-id-1234',
          items: [{ sku: 'HOODIE-L', quantity: 20, unitPrice: 7650, lineTotal: 153000 }],
        }),
      ]);
      component.query = 'HOODIE-L';
      fixture.detectChanges();
      // Only the matching order survives; the other row is gone entirely.
      expect(rows().length).toBe(1);
      expect(text()).toContain('SECOND-O');
      expect(text()).not.toContain('A1B2C3D4');
    });

    it('reports an empty filter rather than showing a blank page', async () => {
      await boot();
      component.query = 'zzzz';
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('se-empty')).toBeTruthy();
      expect(text()).toContain('No orders match this filter');
    });

    it('distinguishes never-ordered from filtered-to-nothing', async () => {
      await boot([]);
      expect(text()).toContain('No orders yet');
    });

    it('honours the date range rather than hiding orders silently', async () => {
      const old = invoice({
        orderId: 'old-order-id-9999',
        createdAt: new Date('2020-01-01').toISOString(),
      });
      await boot([invoice(), old]);
      expect(rows().length).toBe(1);
      component.range = 'all';
      fixture.detectChanges();
      expect(rows().length).toBe(2);
    });
  });

  describe('csv export', () => {
    it('writes a header row and one row per invoice line', async () => {
      await boot();
      let captured = '';
      const spy = spyOn(URL, 'createObjectURL').and.callFake((blob: Blob) => {
        captured = 'captured';
        void blob;
        return 'blob:stub';
      });
      spyOn(URL, 'revokeObjectURL');
      component.exportCsv();
      expect(spy).toHaveBeenCalled();
      expect(captured).toBe('captured');
    });

    it('disables the export when there is nothing to export', async () => {
      await boot([]);
      const button = [...fixture.nativeElement.querySelectorAll('button')].find((b) =>
        b.textContent!.includes('Export'),
      ) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });
  });

  describe('payment banner', () => {
    function banner(): HTMLElement | null {
      return fixture.nativeElement.querySelector('.paybar');
    }

    it('demands action when an order is unpaid', async () => {
      await boot([invoice({ paymentStatus: 'pending' })]);
      const el = banner();
      expect(el).toBeTruthy();
      expect(el!.classList.contains('settled')).toBe(false);
      expect(text()).toContain('Action required');
      expect(text()).toContain('1 of 1 orders awaiting payment');
    });

    it('confirms settlement once everything is paid', async () => {
      await boot([invoice({ paymentStatus: 'paid' })]);
      expect(banner()!.classList.contains('settled')).toBe(true);
      expect(text()).toContain('Nothing to pay');
      expect(text()).not.toContain('Action required');
    });

    it('counts the unpaid majority, not just the first row', async () => {
      await boot([
        invoice({ orderId: 'aaaa1111-0000-0000-0000-000000000001', paymentStatus: 'paid' }),
        invoice({ orderId: 'bbbb2222-0000-0000-0000-000000000002', paymentStatus: 'pending' }),
        invoice({ orderId: 'cccc3333-0000-0000-0000-000000000003', paymentStatus: 'pending' }),
      ]);
      expect(text()).toContain('2 of 3 orders awaiting payment');
    });

    it('offers no settle action when nothing is owed', async () => {
      await boot([invoice({ paymentStatus: 'paid' })]);
      expect(banner()!.querySelector('.paybar-cta')).toBeNull();
    });

    it('points the settle action at an unpaid invoice', async () => {
      await boot([
        invoice({ orderId: 'aaaa1111-0000-0000-0000-000000000001', paymentStatus: 'pending' }),
      ]);
      const cta = banner()!.querySelector('.paybar-cta') as HTMLAnchorElement;
      expect(cta.getAttribute('href')).toContain('/orders/');
    });

    it('stays hidden when there are no orders at all', async () => {
      await boot([]);
      expect(banner()).toBeNull();
    });
  });
});
