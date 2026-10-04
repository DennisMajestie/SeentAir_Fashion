import { RoleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { resolveChannelIntent } from './orders.service';

/**
 * Channel precedence for incoming orders.
 *
 * The rule: an explicit `source` tag wins, the caller's role is the fallback.
 *
 * These cases exist because the precedence was inverted and shipped broken.
 * `shopFromRetail` used to test the role inline:
 *
 *     shopFromRetail = !user || user.role === CUSTOMER || dto.source === 'storefront'
 *
 * so a CUSTOMER short-circuited before `dto.source === 'wholesale_portal'` was
 * ever read. A buyer approved through the public application kept role CUSTOMER
 * (review() set status but not role), their order resolved to RETAIL, and
 * orders.service.ts rejected the batch with "shippingAddress is required" --
 * which the wholesale portal never sends, because wholesale addressing is
 * tracked with the desk. Nothing in the old suite covered the interaction
 * between the tag and the role, so it passed CI and failed in the browser.
 *
 * Each case below is one that must not regress silently.
 */
describe('resolveChannelIntent', () => {
  const user = (role: RoleName): AuthenticatedUser =>
    ({ id: 'u1', email: 'x@test', role }) as AuthenticatedUser;

  describe('the reported failure: wholesale portal, stale CUSTOMER role', () => {
    it('reads the wholesale tag instead of short-circuiting on CUSTOMER', () => {
      const r = resolveChannelIntent(user(RoleName.CUSTOMER), 'wholesale_portal');

      expect(r.shopFromRetail).toBe(false);
      expect(r.shopFromWholesale).toBe(true);
    });

    it('still routes wholesale for a promoted WHOLESALER', () => {
      const r = resolveChannelIntent(user(RoleName.WHOLESALER), 'wholesale_portal');

      expect(r.shopFromRetail).toBe(false);
      expect(r.shopFromWholesale).toBe(true);
    });

    it('gives the wholesale gate a chance to reject an unapproved buyer', () => {
      // Not a pass: an unapproved buyer must reach assertApprovedAccount() and
      // get "requires an approved wholesale account", not fall through to the
      // retail branch and be told to supply a delivery address.
      const r = resolveChannelIntent(user(RoleName.CUSTOMER), 'wholesale_portal');

      expect(r.shopFromWholesale).toBe(true);
    });
  });

  describe('the storefront must stay retail even for wholesaler-role accounts', () => {
    it('keeps a WHOLESALER buying on the storefront at retail pricing', () => {
      const r = resolveChannelIntent(user(RoleName.WHOLESALER), 'storefront');

      expect(r.shopFromRetail).toBe(true);
      expect(r.shopFromWholesale).toBe(false);
    });

    it('keeps a CUSTOMER on the storefront retail', () => {
      const r = resolveChannelIntent(user(RoleName.CUSTOMER), 'storefront');

      expect(r.shopFromRetail).toBe(true);
      expect(r.shopFromWholesale).toBe(false);
    });
  });

  describe('role fallback for programmatic and staff calls with no tag', () => {
    it('routes a WHOLESALER with no source tag to wholesale', () => {
      const r = resolveChannelIntent(user(RoleName.WHOLESALER), undefined);

      expect(r.shopFromRetail).toBe(false);
      expect(r.shopFromWholesale).toBe(true);
    });

    it('keeps a CUSTOMER with no source tag on retail', () => {
      // Guards a real regression: dropping the role fallback would push signed-in
      // customers off the retail branch and into the staff-only in-store path.
      const r = resolveChannelIntent(user(RoleName.CUSTOMER), undefined);

      expect(r.shopFromRetail).toBe(true);
      expect(r.shopFromWholesale).toBe(false);
    });

    it('treats an unrelated marketing attribution as retail, not wholesale', () => {
      // `source` is free text ("instagram", "whatsapp", "tiktok", "direct").
      // Those must not be mistaken for a wholesale tag.
      for (const src of ['instagram', 'whatsapp', 'tiktok', 'direct']) {
        const r = resolveChannelIntent(user(RoleName.CUSTOMER), src);

        expect(r.shopFromRetail).toBe(true);
        expect(r.shopFromWholesale).toBe(false);
      }
    });
  });

  describe('guests', () => {
    it('is retail with no user and no tag', () => {
      const r = resolveChannelIntent(undefined, undefined);

      expect(r.shopFromRetail).toBe(true);
      expect(r.shopFromWholesale).toBe(false);
    });

    it('is retail even if a guest claims the wholesale tag', () => {
      // No account means no approved account to check, so the wholesale branch
      // must not be reachable -- it dereferences `user`.
      const r = resolveChannelIntent(undefined, 'wholesale_portal');

      expect(r.shopFromRetail).toBe(true);
      expect(r.shopFromWholesale).toBe(false);
    });
  });
});