import { Injectable, computed, signal } from '@angular/core';
import { Me } from './api.service';

/** Access levels, lowest to highest, as the API defines them (ACCESS_RANK). */
const RANK: Record<string, number> = { none: 0, own: 1, view: 2, approve: 3, full: 4 };

export type AccessNeed = 'view' | 'approve' | 'full';

/**
 * What the signed-in person's role may do, module by module, as GET /auth/me
 * reports it. Screens use it to leave out what the role cannot use: a button
 * the person may not press is not rendered (PATTERNS.md, 9).
 *
 *     @if (access.can('inventory', 'full')) { <button seButton ...>Adjust stock</button> }
 *
 * The module names are the API's ModuleName values ('inventory',
 * 'raw_materials', 'retail_orders', ...). Use the module and level the
 * endpoint itself requires (its @RequireAccess), so the screen and the API
 * agree.
 *
 * This is a courtesy to the interface, not a permission check: the API
 * enforces access on every request.
 */
@Injectable({ providedIn: 'root' })
export class AccessService {
  /** The signed-in person. Null until the profile has loaded, and after sign-out. */
  readonly me = signal<Me | null>(null);
  readonly access = computed(() => this.me()?.access ?? null);

  level(module: string): string {
    return this.access()?.[module] ?? 'none';
  }

  /** True when the role's level on the module is at least `need`. */
  can(module: string, need: AccessNeed = 'view'): boolean {
    return (RANK[this.level(module)] ?? 0) >= RANK[need];
  }

  /** True when the role reaches `need` on any of the modules. */
  canAny(modules: string[], need: AccessNeed = 'view'): boolean {
    return modules.some((m) => this.can(m, need));
  }
}
