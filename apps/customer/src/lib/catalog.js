import { supabase } from '@p360/shared';

export const CATEGORIES = [
  { id: 'eggs', label: 'Eggs', icon: 'egg-outline', tone: 't1' },
  { id: 'chicken', label: 'Chicken', icon: 'food-drumstick-outline', tone: 't2' },
  { id: 'turkey', label: 'Turkey', icon: 'turkey', tone: 't3' },
  { id: 'live_birds', label: 'Birds & chicks', icon: 'bird', tone: 't3' },
  { id: 'feed', label: 'Feed & supplies', icon: 'sack', tone: 't4' },
  { id: 'drugs', label: 'Drugs & vaccines', icon: 'pill', tone: 't2' },
  { id: 'equipment', label: 'Equipment', icon: 'tools', tone: 't3' },
  { id: 'packaging', label: 'Packaging', icon: 'package-variant', tone: 't4' },
];
// What a supplier (feed, drugs, equipment store) can list: farm supplies only, never birds or eggs.
export const SUPPLY_CATEGORIES = ['feed', 'drugs', 'equipment', 'packaging'];
// What a farm lists: birds, eggs and meat. Stores may also list day-old chicks (STORE_BIRD_TYPES). The database checks the same
// rule (seller_may_list, migration 024).
export const FARM_CATEGORIES = ['eggs', 'chicken', 'turkey', 'live_birds'];
export const STORE_BIRD_TYPES = ['Day-old broiler chicks', 'Day-old layer chicks', 'Noiler chicks', 'Turkey poults'];
// Categories a seller can list, from their roles: farm (vendor), store (supplier) or both.
export const sellerCategories = ({ farm, store }) => {
  const list = CATEGORIES.filter((k) => (farm && FARM_CATEGORIES.includes(k.id)) || (store && (SUPPLY_CATEGORIES.includes(k.id) || k.id === 'live_birds')));
  // a store starts on its own shelves; day-old chicks come last
  return store && !farm ? [...list.filter((k) => k.id !== 'live_birds'), ...list.filter((k) => k.id === 'live_birds')] : list;
};
// Kinds a seller can pick in a category: a store-only seller gets just the day-old chicks under Birds & chicks.
export const sellerTypes = (category, { farm, store }) => (category === 'live_birds' && store && !farm ? STORE_BIRD_TYPES : SUBTYPES[category]);
export const WASTE_CATEGORIES = [
  { id: 'manure', label: 'Manure', icon: 'sprout-outline' },
  { id: 'litter', label: 'Litter', icon: 'leaf' },
  { id: 'feathers', label: 'Feathers', icon: 'feather' },
];
export const ALL_CATEGORIES = [...CATEGORIES, ...WASTE_CATEGORIES];
export const catLabel = (id) => ALL_CATEGORIES.find((x) => x.id === id)?.label || id;
export const UNITS = ['crate', 'bird', 'kg', 'pack', 'bag', 'tonne', 'bottle', 'dose'];
// Farm supplies are sold in their own units, with their own example titles (a feed store never sees "crate" or "bird").
export const SUPPLY_UNITS = { feed: ['bag', 'kg', 'tonne'], drugs: ['bottle', 'dose', 'pack', 'sachet'], equipment: ['piece', 'pack', 'set'], packaging: ['piece', 'pack', 'bundle'] };
const FOOD_UNITS = { chicken: ['kg', 'pack', 'bird'], turkey: ['kg', 'pack', 'bird'], live_birds: ['bird', 'pack'], eggs: ['crate', 'pack'] };
export const unitsFor = (category) => SUPPLY_UNITS[category] || FOOD_UNITS[category] || UNITS.filter((u) => u !== 'tonne');
export const TITLE_EXAMPLE = { eggs: 'Jumbo eggs, crate of 30', chicken: 'Dressed broiler, about 2 kg', turkey: 'Live turkey, about 8 kg', live_birds: 'Point-of-lay pullets, 16 weeks',
  feed: 'Layer mash, 25 kg bag', drugs: 'Newcastle vaccine (Lasota), 1,000 doses', equipment: 'Plastic drinker, 5 litres', packaging: 'Egg crates, pack of 140' };

// Sub-categories (stored as listings.attributes.type) and, for meat, how it is kept (attributes.form).
// Buyers filter by them in the market; sellers pick one when they list. Keep the names short: they are chips.
export const SUBTYPES = {
  eggs: ['Table eggs', 'Jumbo eggs', 'Pullet eggs', 'Fertile eggs', 'Cracked eggs', 'Quail eggs'],
  chicken: ['Whole dressed', 'Breast', 'Wings', 'Thighs', 'Drumsticks', 'Gizzards', 'Liver', 'Feet', 'Neck', 'Mixed parts'],
  turkey: ['Live turkey', 'Whole dressed', 'Wings', 'Thighs', 'Drumsticks', 'Gizzards', 'Mixed parts'],
  live_birds: ['Day-old broiler chicks', 'Day-old layer chicks', 'Noiler chicks', 'Cockerels', 'Point-of-lay pullets', 'Growers', 'Broilers', 'Layers', 'Spent layers', 'Local chickens', 'Turkey poults', 'Ducks', 'Guinea fowl', 'Quail'],
  feed: ['Starter', 'Grower', 'Finisher', 'Chick mash', 'Layer mash', 'Breeder feed', 'Turkey feed', 'Concentrate & premix', 'Maize & soy'],
  drugs: ['Vaccines', 'Antibiotics', 'Vitamins', 'Dewormers', 'Coccidiostats', 'Disinfectants', 'Pest control', 'PPE & syringes'],
  equipment: ['Feeders & drinkers', 'Cages & pens', 'Brooders & heaters', 'Incubators & hatchery', 'Fans & cooling', 'Solar & power', 'Scales & tools'],
  packaging: ['Egg crates', 'Egg cartons', 'Chick boxes', 'Chicken bags', 'Plastic crates', 'Labels'],
};
export const FORMS = ['Fresh', 'Chilled', 'Frozen', 'Smoked'];
// Meat (not live birds) says how it is kept.
export const hasForm = (category, type) => (category === 'chicken' || category === 'turkey') && type !== 'Live turkey';
// One line for a listing's type, e.g. 'Wings · Frozen'.
export const typeLine = (l) => [l?.attributes?.type, l?.attributes?.form].filter(Boolean).join(' · ');
// Seller location comes with every listing so the market can show distance and delivery fee (lib/nearby.js).
export const LISTING_SELECT = '*, vendor:vendor_profiles(user_id, business_name, rating, rating_count, location, lat, lng, parent_id, created_at)';

export async function fetchListings({ category, type, q, vendorId, waste = false, maxPrice, minPrice, sort = 'newest', limit = 40 } = {}) {
  let r = supabase.from('listings').select(LISTING_SELECT).eq('status', 'live').gt('quantity', 0).eq('is_waste', waste);
  if (category) r = r.eq('category', category);
  if (type) r = r.eq('attributes->>type', type);
  if (vendorId) r = r.eq('vendor_id', vendorId);
  // Search also matches the sub-category, so 'wings' finds wings whatever the title says.
  if (q) { const t = q.trim().replace(/[,()*%]/g, ' '); r = r.or('title.ilike.*' + t + '*,attributes->>type.ilike.*' + t + '*'); }
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
