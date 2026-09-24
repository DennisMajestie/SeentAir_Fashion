import { Injectable } from '@angular/core';
import type Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

type SwalModule = typeof Swal;

type Icon = 'success' | 'error' | 'warning' | 'info' | 'question';

/** Options for a branded confirmation dialog. */
export interface AlertConfirm {
  title: string;
  html?: string;
  confirm?: string;
  cancel?: string;
  danger?: boolean;
  icon?: Icon;
}

/** Options for a non-blocking notification toast. */
export interface AlertToast {
  icon?: Icon;
  timer?: number;
}

/** Seentair brand palettes — ivory paper and harvest gold, light + dark. */
const GOLD = '#c9a24b';
const PALETTE = {
  light: {
    fg: '#201b15',
    bg: '#ffffff',
    muted: '#6f675c',
    danger: '#b3442c',
  },
  dark: {
    fg: '#f2ece2',
    bg: '#181412',
    muted: '#a89c88',
    danger: '#c2563f',
  },
} as const;

/** SweetAlert2 dressed in the Seentair identity. Loads the library lazily so
    it never inflates the first-paint bundle; theme is read live from <html>
    so light + dark both get a native-feeling popup. */
@Injectable({ providedIn: 'root' })
export class BrandAlertService {
  private get theme(): 'light' | 'dark' {
    return typeof document !== 'undefined' && document.documentElement.dataset['theme'] === 'dark'
      ? 'dark'
      : 'light';
  }

  private p() {
    return { gold: GOLD, ...PALETTE[this.theme] };
  }

  private async swal(): Promise<SwalModule> {
    const m = await import('sweetalert2');
    return m.default;
  }

  /** Non-blocking toast for confirmations and errors. */
  async toast(text: string, opts: AlertToast = {}): Promise<void> {
    const Swal = await this.swal();
    const p = this.p();
    await Swal.fire({
      toast: true,
      position: 'center',
      timer: opts.timer ?? 2600,
      timerProgressBar: true,
      text,
      icon: opts.icon ?? 'success',
      iconColor: opts.icon === 'error' ? p.danger : p.gold,
      showConfirmButton: false,
      background: p.bg,
      color: p.fg,
      customClass: { popup: 'ba-toast', timerProgressBar: 'ba-timer' },
    });
  }

  /** Branded confirmation. Resolves true only when the user confirms. */
  async confirm(opts: AlertConfirm): Promise<boolean> {
    const Swal = await this.swal();
    const p = this.p();
    const res = await Swal.fire({
      title: opts.title,
      html: opts.html,
      icon: opts.icon ?? 'question',
      iconColor: p.gold,
      showCancelButton: true,
      confirmButtonText: opts.confirm ?? 'Confirm',
      cancelButtonText: opts.cancel ?? 'Cancel',
      reverseButtons: true,
      buttonsStyling: false,
      background: p.bg,
      color: p.fg,
      customClass: {
        popup: 'ba-popup',
        title: 'ba-title',
        htmlContainer: 'ba-html',
        icon: 'ba-icon',
        confirmButton: opts.danger ? 'ba-btn ba-danger' : 'ba-btn ba-confirm',
        cancelButton: 'ba-btn ba-cancel',
      },
    });
    return res.isConfirmed === true;
  }

  /** Branded informational alert. */
  async alert(text: string, title = 'Seentair', icon: Icon = 'info'): Promise<void> {
    const Swal = await this.swal();
    const p = this.p();
    await Swal.fire({
      title,
      text,
      icon,
      iconColor: p.gold,
      showConfirmButton: true,
      confirmButtonText: 'Close',
      buttonsStyling: false,
      background: p.bg,
      color: p.fg,
      customClass: {
        popup: 'ba-popup',
        title: 'ba-title',
        htmlContainer: 'ba-html',
        icon: 'ba-icon',
        confirmButton: 'ba-btn ba-confirm',
      },
    });
  }
}