import { Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { SeConfirmService, SeToastService } from '@seentair/ui';
import { ApiService } from '../api.service';
import { PortalStore } from '../portal.store';
import { ShellStateService } from '../shell-state.service';
import { ThemeService } from '../theme.service';
import { PortalShell } from './portal-shell';

describe('PortalShell — mobile navigation', () => {
  let shell: PortalShell;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: {} },
        { provide: PortalStore, useValue: { load: jasmine.createSpy('load') } },
        { provide: ThemeService, useValue: {} },
        { provide: ShellStateService, useValue: {} },
        { provide: SeConfirmService, useValue: {} },
        { provide: SeToastService, useValue: {} },
        { provide: Router, useValue: {} },
      ],
    });
    shell = TestBed.runInInjectionContext(() => new PortalShell());
  });

  afterEach(() => TestBed.resetTestingModule());

  it('keeps five sections in the bottom bar and moves the rest into More', () => {
    expect(shell.primaryNavItems.map((item) => item.link)).toEqual([
      '/overview',
      '/investment',
      '/performance',
      '/inventory',
      '/settings',
    ]);
    expect(shell.moreNavItems.map((item) => item.link)).toEqual([
      '/reports',
      '/profit-sharing',
      '/documents',
    ]);
    expect(shell.navItems.length).toBe(
      shell.primaryNavItems.length + shell.moreNavItems.length,
    );
  });

  it('opens and closes the More sheet', () => {
    expect(shell.moreOpen()).toBeFalse();
    shell.toggleMore();
    expect(shell.moreOpen()).toBeTrue();
    shell.closeMore();
    expect(shell.moreOpen()).toBeFalse();
  });
});
