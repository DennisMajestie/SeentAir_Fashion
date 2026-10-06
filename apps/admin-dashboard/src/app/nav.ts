import { SeIconName, SeNavGroup } from '@seentair/ui';

/** Module -> access level for the signed-in role, as /auth/me returns it. */
export type AccessMap = Record<string, string>;

interface NavEntry {
  label: string;
  icon: SeIconName;
  link: string;
  exact?: boolean;
  /**
   * The API permission modules this screen reads from. The entry is shown when
   * the role has any access to at least one of them. `null` is for everyone.
   */
  modules: string[] | null;
  /** Shown only at approve level or above (the approvals queue). */
  needsApprove?: boolean;
  /** Key into the counts passed to navFor, for a "waiting for you" badge. */
  badge?: string;
}

/**
 * Every screen in the operations app, grouped, with the permission module each
 * one depends on. The module names are the API's (services/api common/enums
 * ModuleName), and each mapping follows the controller the page calls.
 */
const GROUPS: { title?: string; items: NavEntry[] }[] = [
  {
    items: [
      { label: 'Home', icon: 'home', link: '/', exact: true, modules: null },
      {
        label: 'Approvals',
        icon: 'clipboard-check',
        link: '/approvals',
        modules: ['approvals_audit'],
        needsApprove: true,
        badge: 'approvals',
      },
    ],
  },
  {
    title: 'Sales',
    items: [
      {
        label: 'Orders',
        icon: 'cart',
        link: '/orders',
        modules: ['retail_orders', 'wholesale_orders'],
      },
      { label: 'Returns', icon: 'undo', link: '/returns', modules: ['returns'] },
      { label: 'Custom orders', icon: 'edit', link: '/custom-orders', modules: ['custom_orders'] },
      { label: 'Wholesale', icon: 'users', link: '/wholesale', modules: ['wholesale_orders'] },
      { label: 'Messages', icon: 'message', link: '/messages', modules: ['communication'] },
    ],
  },
  {
    title: 'Product',
    items: [
      { label: 'Catalogue', icon: 'tag', link: '/catalogue', modules: ['catalogue'] },
      { label: 'Inventory', icon: 'box', link: '/inventory', modules: ['inventory'] },
      { label: 'Materials', icon: 'layers', link: '/materials', modules: ['raw_materials'] },
      { label: 'Production', icon: 'factory', link: '/production', modules: ['manufacturing'] },
      { label: 'Tech pack', icon: 'file', link: '/tech-pack', modules: ['catalogue'] },
      { label: 'Floor kiosk', icon: 'monitor', link: '/floor-kiosk', modules: ['manufacturing'] },
    ],
  },
  {
    title: 'Business',
    items: [
      { label: 'Accounting', icon: 'bank', link: '/accounting', modules: ['accounting'] },
      { label: 'Logistics', icon: 'truck', link: '/logistics', modules: ['logistics'] },
      { label: 'Procurement', icon: 'receipt', link: '/vendors', modules: ['raw_materials'] },
      { label: 'Marketing', icon: 'megaphone', link: '/marketing', modules: ['marketing'] },
      { label: 'Reviews', icon: 'star', link: '/reviews', modules: ['catalogue'] },
      { label: 'Partners', icon: 'chart', link: '/partners', modules: ['partners'] },
    ],
  },
  {
    title: 'Admin',
    items: [
      { label: 'Staff', icon: 'user', link: '/staff', modules: ['staff_access'] },
      {
        label: 'Audit log',
        icon: 'rows',
        link: '/audit',
        modules: ['approvals_audit'],
        needsApprove: true,
      },
      { label: 'Security', icon: 'shield', link: '/security', modules: null },
    ],
  },
];

/**
 * The sidebar for one role: only the screens that role can use. A screen the
 * role cannot open is left out, not greyed out, so someone with the Inventory
 * role sees a visibly smaller app than the owner.
 *
 * Until the access map has loaded only the entries open to everyone are shown,
 * so nothing appears and then vanishes.
 *
 * This decides what is OFFERED. What is ALLOWED is decided by the API on every
 * request.
 */
export function navFor(
  access: AccessMap | null,
  counts: Record<string, number> = {},
): SeNavGroup[] {
  const can = (entry: NavEntry): boolean => {
    if (entry.modules === null) return true;
    if (!access) return false;
    return entry.modules.some((m) => {
      const level = access[m];
      if (!level || level === 'none') return false;
      return entry.needsApprove ? level === 'approve' || level === 'full' : true;
    });
  };
  return GROUPS.map((group) => ({
    title: group.title,
    items: group.items.filter(can).map((entry) => ({
      label: entry.label,
      icon: entry.icon,
      link: entry.link,
      exact: entry.exact,
      badge: entry.badge && counts[entry.badge] ? counts[entry.badge] : undefined,
    })),
  })).filter((group) => group.items.length > 0);
}
