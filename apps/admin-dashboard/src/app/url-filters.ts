import { WritableSignal, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SeFilterValue } from '@seentair/ui';

/**
 * The search text and filter choices of a list screen, kept in the URL so a
 * filtered list survives a reload and can be shared (PATTERNS.md, 2).
 *
 *     private readonly filters = urlFilters(['channel', 'payment', 'status']);
 *     readonly query = this.filters.query;        // bind to <se-filter-bar [(query)]>
 *     readonly filterValue = this.filters.value;  // bind to <se-filter-bar [(value)]>
 *
 * The search is the `q` parameter; each filter key is a parameter of the same
 * name. Call it in a field initialiser or constructor (it needs injection).
 */
export function urlFilters(keys: string[]): {
  query: WritableSignal<string>;
  value: WritableSignal<SeFilterValue>;
} {
  const route = inject(ActivatedRoute);
  const router = inject(Router);
  const params = route.snapshot.queryParamMap;

  const query = signal(params.get('q') ?? '');
  const value = signal<SeFilterValue>(
    Object.fromEntries(keys.map((key) => [key, params.get(key) ?? '']).filter(([, v]) => v)),
  );

  effect(() => {
    const q = query().trim();
    const chosen = value();
    untracked(() => {
      void router.navigate([], {
        relativeTo: route,
        queryParams: {
          q: q || null,
          ...Object.fromEntries(keys.map((key) => [key, chosen[key] || null])),
        },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });
  });

  return { query, value };
}
