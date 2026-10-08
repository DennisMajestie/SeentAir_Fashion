/**
 * Customer-facing name for OrderStatus.STOCK_EXCEPTION.
 *
 * Not a member of OrderStatus: it is never stored and never staff-facing, it
 * exists only in buyer-facing projections (order tracking, wholesale invoices).
 * The stored value stays `stock_exception` so admin, the ledger and the staff
 * tracker are unaffected.
 *
 * Lives in its own leaf module rather than on OrdersService so buyer-facing
 * readers (WholesaleService) can share it without importing OrdersService,
 * which already imports WholesaleService.
 */
export const CUSTOMER_AWAITING_STOCK = 'awaiting_stock';
