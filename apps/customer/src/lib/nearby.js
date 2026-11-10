// Distance and delivery fee between a seller and a buyer. Pure (Node-testable).
// The fee must match delivery_fee_for() in supabase/schema.sql: ₦800 + ₦100 per km (straight line,
// rounded up, at least 1 km), at most ₦3,000; ₦1,250 when either place isn't pinned.
export const FLAT_FEE = 1250;
const BASE = 800, PER_KM = 100, MAX_FEE = 3000;

const rad = (d) => (d * Math.PI) / 180;
const pinned = (p) => p && p.lat != null && p.lng != null;

export function distanceKm(a, b) {
  if (!pinned(a) || !pinned(b)) return null;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// seller and buyer: { lat, lng } (either may be missing)
export function deliveryFee(seller, buyer) {
  const km = distanceKm(seller, buyer);
  return km == null ? FLAT_FEE : Math.min(MAX_FEE, BASE + PER_KM * Math.max(1, Math.ceil(km)));
}

// Rough time on a bike in town once the order is collected, in 5-minute steps.
export const rideMinutes = (km) => Math.max(15, Math.ceil((10 + km * 4) / 5) * 5);

export const kmLabel = (km) => (km < 1 ? 'Under 1 km' : (km < 10 ? km.toFixed(1) : String(Math.round(km))) + ' km');

// Nearest first; sellers with no location keep their order at the end.
export function byDistance(items, spot, sellerOf = (x) => x.vendor) {
  return items.map((x, i) => ({ x, i, d: distanceKm(sellerOf(x), spot) }))
    .sort((a, b) => (a.d == null) - (b.d == null) || (a.d ?? 0) - (b.d ?? 0) || a.i - b.i)
    .map((r) => r.x);
}
