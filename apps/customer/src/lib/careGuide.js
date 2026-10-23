// Vaccination, routine-drug and feed guide for the two chicken types Poultry360 supports:
// broilers (meat) and layers (eggs). Pure data + date maths, no React, so it can be tested in Node.
//
// It is a GUIDE, not a prescription, so the vaccine view must always show GUIDE_COPY.
// Ages are days since the chicks arrived (the flock's start date = day 0), the same count Farm Hub shows as "Day N".
// Keep the wording short: what to give, when, how. No sourcing or background text.

export const GUIDE_COPY = 'A general guide. Confirm dates with your vet and follow the product label.';

export const BIRDS = {
  broilers: { label: 'Broilers', purpose: 'Meat', icon: 'food-drumstick-outline', cycle: 'Sold at 6 to 8 weeks' },
  layers: { label: 'Layers', purpose: 'Eggs', icon: 'egg-outline', cycle: 'Start laying at 18 to 20 weeks' },
};

// The first four weeks are the same for both types.
const BROODING = [
  { day: 1, kind: 'vaccine', hatchery: true, name: "Marek's + Newcastle (NDV i/o)", against: "Marek's, Newcastle", route: 'Given at the hatchery', note: 'Confirm with your chick supplier.' },
  { day: 1, to: 5, kind: 'drug', name: 'Glucose + multivitamins', against: 'Stress', route: 'Drinking water', note: 'Repeat vitamins for a day after each vaccination.' },
  { day: 7, to: 10, kind: 'vaccine', name: 'Gumboro (IBD) · 1st', against: 'Gumboro', route: 'Drinking water' },
  { day: 14, kind: 'vaccine', name: 'Newcastle (Lasota) · 1st', against: 'Newcastle', route: 'Drinking water' },
  { day: 21, kind: 'vaccine', name: 'Gumboro (IBD) · 2nd', against: 'Gumboro', route: 'Drinking water' },
  { day: 21, to: 28, kind: 'drug', name: 'Coccidiosis watch', against: 'Coccidiosis', route: 'Drinking water, if needed', note: 'Keep litter dry. Treat only if you see bloody droppings.' },
  { day: 28, kind: 'vaccine', name: 'Newcastle (Lasota) · 2nd', against: 'Newcastle', route: 'Drinking water' },
];

export const HEALTH = {
  broilers: [
    ...BROODING,
    { day: 35, toSale: true, kind: 'drug', name: 'Stop drugs before sale', against: 'Drug residue in meat', route: 'Nothing to give', note: 'Follow the withdrawal period on the label.' },
  ],
  layers: [
    ...BROODING,
    { day: 42, kind: 'vaccine', name: 'Fowl pox', against: 'Fowl pox', route: 'Wing web' },
    { day: 49, kind: 'vaccine', name: 'Fowl typhoid', against: 'Fowl typhoid', route: 'Injection under the skin' },
    { day: 56, kind: 'vaccine', name: 'Newcastle (Komarov) · 1st', against: 'Newcastle', route: 'Injection into the muscle', note: 'Only after Lasota. Never under 6 weeks.' },
    { day: 56, to: 63, kind: 'drug', name: 'Deworming · 1st', against: 'Worms', route: 'Drinking water' },
    { day: 63, to: 70, kind: 'vaccine', name: 'Fowl cholera', against: 'Fowl cholera', route: 'Injection under the skin' },
    { day: 112, kind: 'vaccine', name: 'Newcastle (Komarov) · booster', against: 'Newcastle', route: 'Injection into the muscle', note: 'Finish all injections before the first eggs.' },
    { day: 112, to: 126, kind: 'drug', name: 'Deworming · before lay', against: 'Worms', route: 'Drinking water', note: 'Repeat every 3 months while laying.' },
    { day: 168, kind: 'vaccine', repeatDays: 56, until: 504, name: 'Newcastle (Lasota) · booster', against: 'Newcastle', route: 'Drinking water' },
    { day: 126, laying: true, kind: 'drug', name: 'Drugs while laying', against: 'Drug residue in eggs', route: 'Nothing to give', note: 'Check the egg withdrawal period on the label.' },
  ],
};

// Feed by age. `to: null` = until the flock is sold / stops laying. kgPerBird is the rough total for the stage;
// gPerDay is used for the open-ended laying stage.
export const FEEDS = {
  broilers: [
    { from: 0, to: 28, name: 'Broiler starter', form: 'Crumbs or mash', protein: '22 to 23% protein', kgPerBird: 1.3 },
    { from: 29, to: null, endDay: 49, name: 'Broiler finisher', form: 'Pellets or mash', protein: '19 to 20% protein', kgPerBird: 3.2 },
  ],
  layers: [
    { from: 0, to: 56, name: 'Chick mash', form: 'Mash', protein: '18 to 20% protein', kgPerBird: 2 },
    { from: 57, to: 126, name: 'Grower mash', form: 'Mash', protein: '15 to 16% protein', kgPerBird: 6, note: 'Keep them on it until the first eggs.' },
    { from: 127, to: null, name: 'Layer mash', form: 'Mash or pellets', protein: '16 to 17% protein + calcium', gPerDay: 120, note: 'From the first eggs onwards.' },
  ],
};

export const FEED_RULES = [
  'Change feed over 3 to 5 days, mixing old and new.',
  'No layer mash for chicks. No broiler feed for layers.',
  'Clean water all day.',
];

export const VACCINE_NOTES = [
  'Keep vaccines cold (2 to 8°C) and check the expiry date.',
  'Water vaccines: no chlorine, and finished within 2 hours.',
  'Vaccinate only healthy birds, in the cool of the day.',
];

// What each type produces, so the farmer knows what "on track" looks like.
export const EXPECT = {
  broilers: {
    title: 'Average weight per bird', unit: 'Log output in kg',
    rows: [['Week 1', '0.15 to 0.2 kg'], ['Week 2', '0.4 to 0.5 kg'], ['Week 3', '0.8 to 0.9 kg'], ['Week 4', '1.2 to 1.5 kg'], ['Week 5', '1.7 to 2.0 kg'], ['Week 6', '2.0 to 2.5 kg'], ['Weeks 7 to 8', '2.5 to 3 kg']],
    note: 'Weigh 10 birds each week and compare.',
  },
  layers: {
    title: 'Eggs per day', unit: 'Log output in eggs (30 = 1 crate)',
    rows: [['Weeks 1 to 17', 'None, still growing'], ['Weeks 18 to 20', 'First eggs'], ['Weeks 26 to 30', 'Peak: 8 to 9 eggs from every 10 hens'], ['Up to week 72', 'Above 7 from every 10 hens'], ['After week 72', 'Sell when eggs no longer cover feed']],
    note: 'A sudden drop in eggs is an early sign of a problem.',
  },
};

const DAY = 864e5;
const local = (iso) => new Date(iso + 'T00:00:00');
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
export const addDays = (isoDate, n) => { const d = local(String(isoDate).slice(0, 10)); d.setDate(d.getDate() + n); return iso(d); };

// Days since the chicks arrived (0 on the start date), the same count Farm Hub shows.
export function ageDays(flock, today) {
  return Math.max(0, Math.round((local(today) - local(String(flock.start_date).slice(0, 10))) / DAY));
}

// "Day 7", "Days 7 to 10", "Week 6", "Week 24, then every 8 weeks". Days for the first 4 weeks, weeks after.
export function ageLabel(item) {
  const one = (d) => (d <= 28 ? 'Day ' + d : 'Week ' + Math.round(d / 7));
  if (item.laying) return 'While laying';
  if (item.toSale) return 'Week ' + Math.round(item.day / 7) + ' to sale';
  if (item.repeatDays) return one(item.day) + ', then every ' + Math.round(item.repeatDays / 7) + ' weeks';
  if (!item.to) return one(item.day);
  if (item.to <= 28) return 'Days ' + item.day + ' to ' + item.to;
  const a = Math.round(item.day / 7), b = Math.round(item.to / 7);
  return a === b ? 'Week ' + a : 'Weeks ' + a + ' to ' + b;
}

// Every dated vaccination for one flock: [{ vaccine, scheduled_date, day }]. Hatchery vaccines and
// routine drugs are left out (the schedule and its phone reminders are for vaccines the farmer gives).
export function planVaccinations(type, startDate) {
  const out = [];
  const start = String(startDate).slice(0, 10);
  for (const it of HEALTH[type] || []) {
    if (it.kind !== 'vaccine' || it.hatchery) continue;
    if (it.repeatDays) { for (let d = it.day; d <= it.until; d += it.repeatDays) out.push({ vaccine: it.name, scheduled_date: addDays(start, d), day: d }); }
    else out.push({ vaccine: it.name, scheduled_date: addDays(start, it.day), day: it.day });
  }
  return out.sort((a, b) => a.day - b.day);
}

// The planned vaccinations still ahead of this flock that are not on its schedule yet.
export function missingVaccinations(flock, existing, today) {
  const have = new Set((existing || []).filter((v) => v.flock_id === flock.id).map((v) => v.vaccine + '|' + v.scheduled_date));
  return planVaccinations(flock.type, flock.start_date).filter((p) => p.scheduled_date >= today && !have.has(p.vaccine + '|' + p.scheduled_date));
}

// Where one chart row stands for a flock: 'given' | 'scheduled' | 'now' | 'next' | 'past'.
export function rowStatus(item, flock, existing, today) {
  const age = ageDays(flock, today);
  const end = item.laying || item.toSale ? Infinity : item.repeatDays ? item.until : item.to || item.day;
  if (item.kind === 'vaccine' && !item.hatchery) {
    const mine = (existing || []).filter((v) => v.flock_id === flock.id && v.vaccine === item.name);
    if (!item.repeatDays && mine.some((v) => v.administered_date)) return 'given';
    if (mine.some((v) => !v.administered_date && v.scheduled_date >= today)) return age >= item.day && age <= end ? 'now' : 'scheduled';
  }
  if (age > end) return 'past';
  if (age >= item.day) return 'now';
  return 'next';
}

export function feedStage(type, age) {
  const list = FEEDS[type] || [];
  return list.find((s) => age >= s.from && (s.to == null || age <= s.to)) || list[list.length - 1];
}

// Rough feed needed for `birds` birds: 25 kg bags for a whole stage, or kg per day for the laying stage.
export function feedNeed(stage, birds) {
  if (stage.gPerDay) { const kg = (stage.gPerDay * birds) / 1000; return { perDayKg: kg, bagEveryDays: kg ? 25 / kg : 0 }; }
  const kg = stage.kgPerBird * birds;
  return { totalKg: kg, bags: Math.ceil(kg / 25) };
}

// One list for every flock type, for the general chart: each row says which flocks take it
// (`for`: 'all' | 'broilers' | 'layers'), sorted by age with the "while laying" note last.
export function generalHealth() {
  const key = (it) => it.name + '|' + it.day;
  const inB = new Set(HEALTH.broilers.map(key));
  const inL = new Set(HEALTH.layers.map(key));
  const seen = new Set();
  const out = [];
  for (const it of [...HEALTH.broilers, ...HEALTH.layers]) {
    const k = key(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...it, for: inB.has(k) && inL.has(k) ? 'all' : inB.has(k) ? 'broilers' : 'layers' });
  }
  const rank = (it) => (it.laying ? 1e6 : it.day);
  return out.sort((a, b) => rank(a) - rank(b));
}
