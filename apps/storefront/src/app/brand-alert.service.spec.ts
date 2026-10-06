import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { BrandAlertService } from './brand-alert.service';

/**
 * The notices are plain DOM appended to <body>, so they are asserted there
 * rather than through a component fixture.
 */
describe('BrandAlertService', () => {
  let alerts: BrandAlertService;

  const toasts = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.ba-toast')];
  const dialog = (): HTMLDialogElement | null => document.querySelector('dialog.ba-dialog');

  beforeEach(() => {
    alerts = TestBed.inject(BrandAlertService);
  });

  afterEach(() => {
    document.querySelectorAll('.ba-toast-host, dialog.ba-dialog').forEach((n) => n.remove());
  });

  describe('toast', () => {
    it('shows the message as a status notice and removes itself', fakeAsync(() => {
      let done = false;
      void alerts.toast('Tote added to cart').then(() => (done = true));
      expect(toasts().length).toBe(1);
      expect(toasts()[0].textContent).toContain('Tote added to cart');
      expect(toasts()[0].getAttribute('role')).toBe('status');
      tick(2600);
      expect(done).toBeTrue();
      tick(220);
      expect(toasts().length).toBe(0);
    }));

    it('announces an error assertively', fakeAsync(() => {
      void alerts.toast('Order failed', { icon: 'error' });
      expect(toasts()[0].getAttribute('role')).toBe('alert');
      tick(3000);
    }));

    it('replaces the previous toast instead of stacking', fakeAsync(() => {
      void alerts.toast('First');
      void alerts.toast('Second');
      tick(220);
      expect(toasts().map((t) => t.textContent)).toEqual(['Second']);
      tick(3000);
    }));

    it('renders the message as text, never as markup', fakeAsync(() => {
      void alerts.toast('<img src=x onerror=alert(1)>');
      expect(toasts()[0].querySelector('img')).toBeNull();
      tick(3000);
    }));

    it('runs the follow-up action and closes', fakeAsync(() => {
      const run = jasmine.createSpy('run');
      void alerts.toast('Tote added to cart', { action: { label: 'View cart', run } });
      const btn = toasts()[0].querySelector<HTMLButtonElement>('.ba-toast__action')!;
      expect(btn.textContent).toBe('View cart');
      btn.click();
      expect(run).toHaveBeenCalledTimes(1);
      tick(220);
      expect(toasts().length).toBe(0);
    }));
  });

  describe('confirm', () => {
    it('resolves true on confirm and removes the dialog', async () => {
      const result = alerts.confirm({ title: 'Sign out?', html: 'End this session.', confirm: 'Sign out' });
      const dlg = dialog()!;
      expect(dlg.open).toBeTrue();
      expect(dlg.querySelector('.ba-dialog__title')!.textContent).toBe('Sign out?');
      expect(dlg.querySelector('.ba-dialog__body')!.textContent).toBe('End this session.');
      dlg.querySelector<HTMLButtonElement>('.ba-confirm')!.click();
      expect(await result).toBeTrue();
      expect(dialog()).toBeNull();
    });

    it('resolves false on cancel', async () => {
      const result = alerts.confirm({ title: 'Sign out?', cancel: 'Stay' });
      const cancel = dialog()!.querySelector<HTMLButtonElement>('.ba-cancel')!;
      expect(cancel.textContent).toBe('Stay');
      cancel.click();
      expect(await result).toBeFalse();
    });

    it('resolves false when dismissed with Escape or the backdrop', async () => {
      const result = alerts.confirm({ title: 'Delete supplier?' });
      // What the browser does for Escape: close with no return value.
      dialog()!.close();
      expect(await result).toBeFalse();
    });

    it('marks a destructive confirm and keeps focus off it', async () => {
      const result = alerts.confirm({ title: 'Reject request?', danger: true, confirm: 'Reject' });
      const dlg = dialog()!;
      expect(dlg.classList).toContain('ba-dialog--danger');
      expect(dlg.querySelector('.ba-danger')!.textContent).toBe('Reject');
      expect(document.activeElement).toBe(dlg.querySelector('.ba-cancel'));
      dlg.close();
      await result;
    });

    it('renders the supporting line as text, never as markup', async () => {
      const result = alerts.confirm({ title: 'Delete?', html: '"<b>Acme</b>" will be removed.' });
      const body = dialog()!.querySelector('.ba-dialog__body')!;
      expect(body.querySelector('b')).toBeNull();
      expect(body.textContent).toBe('"<b>Acme</b>" will be removed.');
      dialog()!.close();
      await result;
    });
  });
});
