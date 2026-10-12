// Investment maths: pure functions, no I/O.
// projected_roi_pct = total return over the whole term, as a % of principal.

// Feature flag: hides every investment entry point when false. TEST-ONLY until product and legal sign off.
export const INVEST_ENABLED = true;

export function projectReturn(amount, roiPct, months) {
  const profit = Math.round(amount * roiPct / 100);
  const annualised = months ? (roiPct / months) * 12 : 0;
  return { profit, total: amount + profit, annualised, monthly: months ? Math.round(profit / months) : 0 };
}
export const daysLeft = (closesAt) => Math.max(0, Math.ceil((new Date(closesAt) - Date.now()) / 864e5));
export const progress = (raised, target) => Math.min(1, Number(raised) / Number(target || 1));
export const ESTIMATE_COPY = 'Estimate only. Returns are not guaranteed and you could lose some or all of your money.';
