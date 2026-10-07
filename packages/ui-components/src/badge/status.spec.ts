import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SeStatusComponent } from './badge.component';
import { SE_STATUS, statusMeaning } from './status';

describe('status mapping', () => {
  it('covers every state the API sends for orders, payments, approvals and stock', () => {
    // The enum values in services/api: OrderStatus, PaymentStatus,
    // PaymentRecordStatus, ApprovalStatus, AvailabilityStatus.
    const sent = {
      order: [
        'awaiting_payment',
        'order_received',
        'processing',
        'shipped',
        'delivered',
        'returned',
        'stock_exception',
        'cancelled',
      ],
      payment: ['unpaid', 'paid', 'refunded', 'pending', 'success', 'failed'],
      approval: ['pending', 'approved', 'rejected'],
      stock: ['in_stock', 'out_of_stock', 'made_to_order'],
    } as const;
    for (const [kind, values] of Object.entries(sent)) {
      for (const value of values) {
        expect(SE_STATUS[kind as keyof typeof sent][value])
          .withContext(`${kind}.${value}`)
          .toBeDefined();
      }
    }
  });

  it('gives the same wording and tone wherever a state appears', () => {
    expect(statusMeaning('order', 'awaiting_payment')).toEqual({
      label: 'Awaiting payment',
      tone: 'warning',
    });
    expect(statusMeaning('approval', 'REJECTED')).toEqual({ label: 'Rejected', tone: 'danger' });
  });

  it('reads a configured stage name however it is written', () => {
    expect(statusMeaning('production', 'Quality Control')).toEqual({
      label: 'Quality check',
      tone: 'warning',
    });
    expect(statusMeaning('production', 'Production Planned').label).toBe('Planned');
    // A stage the factory renamed is shown in its own words.
    expect(statusMeaning('production', 'Embroidery')).toEqual({
      label: 'Embroidery',
      tone: 'neutral',
    });
  });

  it('shows an unmapped state as readable neutral text rather than hiding it', () => {
    expect(statusMeaning('order', 'on_hold_for_review')).toEqual({
      label: 'On hold for review',
      tone: 'neutral',
    });
    expect(statusMeaning('order', null)).toEqual({ label: 'Unknown', tone: 'neutral' });
  });
});

@Component({
  imports: [SeStatusComponent],
  template: `<se-status kind="payment" [value]="value" />`,
})
class Host {
  value = 'paid';
}

describe('se-status', () => {
  it('renders the mapped word in the mapped tone', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const badge = (fixture.nativeElement as HTMLElement).querySelector('se-status')!;
    expect(badge.textContent!.trim()).toBe('Paid');
    expect(badge.classList).toContain('se-badge--success');
  });
});
