export function pill(status?: string): string {
  const s = (status ?? '').toLowerCase();
  if (
    s.includes('paid') || s.includes('delivered') || s.includes('complete') ||
    s.includes('approved') || s.includes('sample_approved') || s.includes('fulfilled')
  ) return 'ok';
  if (
    s.includes('pending') || s.includes('processing') || s.includes('shipped') ||
    s.includes('quoted') || s.includes('in_production') || s.includes('under_review')
  ) return 'warn';
  if (s.includes('cancelled') || s.includes('failed') || s.includes('rejected')) return 'bad';
  return '';
}