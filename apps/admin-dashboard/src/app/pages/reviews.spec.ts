import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SeConfirmService } from '@seentair/ui';
import { of, throwError } from 'rxjs';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
import { ReviewRow, ReviewsAdminPage } from './reviews.page';

const review = (over: Partial<ReviewRow> = {}): ReviewRow => ({
  id: 'r1',
  rating: 4,
  comment: 'Fits well',
  createdAt: '2026-09-15T15:27:00',
  variant: { sku: 'TEE-BLK-M' },
  ...over,
});

describe('ReviewsAdminPage', () => {
  let fixture: ComponentFixture<ReviewsAdminPage>;
  let api: jasmine.SpyObj<ApiService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const mount = (reviews: unknown, catalogue = 'full'): void => {
    api = jasmine.createSpyObj<ApiService>('ApiService', ['pendingReviews', 'moderateReview']);
    api.pendingReviews.and.returnValue(reviews as never);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    TestBed.inject(AccessService).me.set({
      name: 'T',
      email: 't@x',
      role: 'r',
      totpEnabled: false,
      access: { catalogue },
    });
    fixture = TestBed.createComponent(ReviewsAdminPage);
    fixture.detectChanges();
  };
  afterEach(() => fixture?.destroy());

  it('lists waiting reviews in the shared table with a plain rating', () => {
    mount(of([review(), review({ id: 'r2', rating: 2, comment: null })]));
    const rows = el().querySelectorAll('se-table tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('TEE-BLK-M');
    expect(rows[0].textContent).toContain('4 of 5');
    expect(rows[1].textContent).toContain('No comment');
    expect(el().querySelector('h1')!.textContent).toBe('Reviews');
  });

  it('shows a failed load as an error, never as "no reviews waiting"', () => {
    mount(throwError(() => ({ error: { message: 'Database is unreachable.' } })));
    expect(el().querySelector('.se-banner--danger')!.textContent).toContain(
      'Database is unreachable.',
    );
    expect(el().textContent).not.toContain('No reviews waiting');
  });

  it('asks for a reason before rejecting and sends nothing when declined', async () => {
    mount(of([review()]));
    const ask = spyOn(TestBed.inject(SeConfirmService), 'askWithReason').and.resolveTo(null);
    await fixture.componentInstance.decide(review(), 'rejected');
    const asked = ask.calls.mostRecent().args[0];
    expect(asked.title).toBe('Reject the review of TEE-BLK-M?');
    expect(asked.consequence).toContain('stays hidden from the storefront');
    expect(asked.confirmLabel).toBe('Reject review');
    expect(api.moderateReview).not.toHaveBeenCalled();
  });

  it('sends the same body as before once publishing is confirmed', async () => {
    mount(of([review()]));
    spyOn(TestBed.inject(SeConfirmService), 'ask').and.resolveTo(true);
    api.moderateReview.and.returnValue(of({}));
    await fixture.componentInstance.decide(review(), 'published');
    expect(api.moderateReview).toHaveBeenCalledWith('r1', 'published');
  });

  it('shows no moderation buttons to a role without full catalogue access', () => {
    mount(of([review()]), 'view');
    expect(el().querySelector('.se-table__actions button')).toBeNull();
  });
});
