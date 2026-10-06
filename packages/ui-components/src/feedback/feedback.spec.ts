import { Component, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { SeBannerComponent } from './banner.component';
import { SeConfirmService } from './confirm.service';
import { SeDrawerComponent } from './drawer.component';
import { SeToastService } from './toast.service';

describe('se-banner', () => {
  @Component({
    imports: [SeBannerComponent],
    template: `
      <se-banner [tone]="tone" title="Heads up" actionLabel="Retry" (action)="acted = true">Body</se-banner>
    `,
  })
  class Host {
    tone: 'info' | 'danger' = 'info';
    acted = false;
  }

  it('is announced politely for information and as an alert for a failure', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const banner = (fixture.nativeElement as HTMLElement).querySelector('se-banner')!;
    expect(banner.getAttribute('role')).toBe('status');
    fixture.componentInstance.tone = 'danger';
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(banner.getAttribute('role')).toBe('alert');
    expect(banner.classList).toContain('se-banner--danger');
  });

  it('offers its action', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('se-banner button')!.click();
    expect(fixture.componentInstance.acted).toBeTrue();
  });
});

describe('SeToastService', () => {
  let toast: SeToastService;
  const toasts = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.se-toast')];
  beforeEach(() => (toast = TestBed.inject(SeToastService)));
  afterEach(() => document.querySelectorAll('.se-toast-host').forEach((n) => n.remove()));

  it('shows one toast at a time and removes it by itself', fakeAsync(() => {
    toast.show('First');
    toast.show('Second');
    tick(250);
    expect(toasts().map((t) => t.textContent)).toEqual(['Second']);
    expect(toasts()[0].getAttribute('role')).toBe('status');
    tick(3000 + 250);
    expect(toasts().length).toBe(0);
  }));

  it('announces a failure as an alert', fakeAsync(() => {
    toast.show('Could not save', { tone: 'danger' });
    expect(toasts()[0].getAttribute('role')).toBe('alert');
    tick(4000);
  }));

  it('runs its action and closes', fakeAsync(() => {
    const run = jasmine.createSpy('run');
    toast.show('Archived', { action: { label: 'Undo', run } });
    toasts()[0].querySelector('button')!.click();
    expect(run).toHaveBeenCalledTimes(1);
    tick(250);
    expect(toasts().length).toBe(0);
  }));

  it('never renders the message as markup', fakeAsync(() => {
    toast.show('<img src=x>');
    expect(toasts()[0].querySelector('img')).toBeNull();
    tick(4000);
  }));
});

describe('SeConfirmService', () => {
  let confirm: SeConfirmService;
  const dialog = (): HTMLDialogElement => document.querySelector<HTMLDialogElement>('dialog.se-dialog')!;
  beforeEach(() => (confirm = TestBed.inject(SeConfirmService)));
  afterEach(() => document.querySelectorAll('dialog.se-dialog').forEach((n) => n.remove()));

  const ask = (danger = false) =>
    confirm.ask({
      title: 'Delete supplier Aba Textile Mills?',
      consequence: 'The supplier is removed. This cannot be undone.',
      confirmLabel: 'Delete supplier',
      danger,
    });

  it('states the action and its consequence, and labels the button with the verb', async () => {
    const result = ask();
    const d = dialog();
    expect(d.open).toBeTrue();
    expect(d.querySelector('.se-dialog__title')!.textContent).toBe('Delete supplier Aba Textile Mills?');
    expect(d.querySelector('.se-dialog__consequence')!.textContent).toContain('cannot be undone');
    expect(d.getAttribute('aria-describedby')).toBe(d.querySelector('.se-dialog__consequence')!.id);
    const confirmButton = [...d.querySelectorAll('button')].at(-1)!;
    expect(confirmButton.textContent).toBe('Delete supplier');
    confirmButton.click();
    expect(await result).toBeTrue();
    expect(document.querySelector('dialog.se-dialog')).toBeNull();
  });

  it('resolves false on cancel and on Escape', async () => {
    const cancelled = ask();
    dialog().querySelector('button')!.click();
    expect(await cancelled).toBeFalse();

    const escaped = ask();
    dialog().close(); // what the browser does for Escape
    expect(await escaped).toBeFalse();
  });

  it('starts a destructive dialog on Cancel, with a danger button', async () => {
    const result = ask(true);
    const d = dialog();
    expect(document.activeElement!.textContent).toBe('Cancel');
    expect([...d.querySelectorAll('button')].at(-1)!.classList).toContain('se-btn--danger');
    d.close();
    await result;
  });
});

describe('se-drawer', () => {
  @Component({
    imports: [SeDrawerComponent],
    template: `<se-drawer title="Add supplier" [(open)]="open"><p>Fields</p></se-drawer>`,
  })
  class Host {
    readonly open = signal(false);
  }

  it('opens as a modal dialog named by its title, and closes back into the model', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const d = (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
    expect(d.open).toBeFalse();

    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    expect(d.open).toBeTrue();
    expect(document.getElementById(d.getAttribute('aria-labelledby')!)!.textContent).toBe('Add supplier');

    d.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.open()).toBeFalse();
    expect(d.open).toBeFalse();
  });
});
