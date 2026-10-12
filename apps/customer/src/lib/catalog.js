import { supabase } from '@p360/shared';

export const CATEGORIES = [
  { id: 'eggs', label: 'Eggs', icon: 'egg-outline', tone: 't1' },
  { id: 'chicken', label: 'Chicken', icon: 'food-drumstick-outline', tone: 't2' },
  { id: 'turkey', label: 'Turkey', icon: 'turkey', tone: 't3' },
  { id: 'live_birds', label: 'Live birds', icon: 'bird', tone: 't3' },
  { id: 'feed', label: 'Feed & supplies', icon: 'sack', tone: 't4' },
  { id: 'drugs', label: 'Drugs & vaccines', icon: 'pill', tone: 't2' },
];
export const WASTE_CATEGORIES = [
  { id: 'manure', label: 'Manure', icon: 'sprout-outline' },
  { id: 'litter', label: 'Litter', icon: 'leaf' },
  { id: 'feathers', label: 'Feathers', icon: 'feather' },
];
export const ALL_CATEGORIES = [...CATEGORIES, ...WASTE_CATEGORIES];
export const catLabel = (id) => ALL_CATEGORIES.find((x) => x.id === id)?.label || id;
export const UNITS = ['crate', 'bird', 'kg', 'pack', 'bag', 'tonne', 'bottle', 'dose'];
export const DELIVERY_FEE = 1250;

export const LISTING_SELECT = '*, vendor:vendor_profiles(user_id, business_name, rating, rating_count, location, created_at)';

export async function fetchListings({ category, q, vendorId, waste = false, maxPrice, minPrice, sort = 'newest', limit = 40 } = {}) {
  let r = supabase.from('listings').select(LISTING_SELECT).eq('status', 'live').gt('quantity', 0).eq('is_waste', waste);
  if (category) r = r.eq('category', category);
  if (vendorId) r = r.eq('vendor_id', vendorId);
  if (q) r = r.ilike('title', '%' + q.trim() + '%');
  if (minPrice) r = r.gte('price', minPrice);
  if (maxPrice) r = r.lte('price', maxPrice);
  r = sort === 'cheapest' ? r.order('price', { ascending: true }) : r.order('created_at', { ascending: false });
  const { data, error } = await r.limit(limit);
  if (error) throw error;
  return data;
}

export async function deliveryContext() {
  const [{ data: addrs }, { data: cov }] = await Promise.all([
    supabase.from('addresses').select('*').order('created_at'),
    supabase.from('coverage_areas').select('name'),
  ]);
  const areas = (cov || []).map((x) => x.name);
  const primary = addrs?.[0] || null;
  return { addresses: addrs || [], areas, primary, covered: primary ? areas.includes(primary.area) : null };
}

export function deliveryEta() {
  const h = new Date().getHours();
  return h < 13 ? 'today, 2–6 PM' : 'tomorrow, 10 AM–2 PM';
}
