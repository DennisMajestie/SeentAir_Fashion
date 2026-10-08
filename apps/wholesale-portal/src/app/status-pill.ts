export function pill(status?: string): string {
  const s = (status ?? '').toLowerCase();
  if (
    s.includes('paid') ||
    s.includes('delivered') ||
    s.includes('complete') ||
    s.includes('approved') ||
    s.includes('sample_approved') ||
    s.includes('fulfilled')
  )
    return 'ok';
  if (
    s.includes('pending') ||
    s.includes('processing') ||
    s.includes('shipped') ||
    s.includes('quoted') ||
    s.includes('in_production') ||
    // awaiting_stock is the customer-facing name the API reports for a paid
    // order that is short on stock. `pending` alone does not catch it because
    // the value is awaiting_stock, not *pending*_something, so without this it
    // fell through to the neutral tone and read as an ordinary state.
    s.includes('awaiting_stock') ||
    s.includes('awaiting stock') ||
    s.includes('under_review')
  )
    return 'warn';
  if (s.includes('cancelled') || s.includes('failed') || s.includes('rejected')) return 'bad';
  return '';
}
