// Vaccination, routine-drug and feed guide for the two chicken types Poultry360 supports:
// broilers (meat) and layers (eggs). Pure data + date maths, no React, so it can be tested in Node.
//
// This is the programme commonly followed on Nigerian farms, built around the vaccines NVRI (Vom) makes.
// It is a GUIDE, not a prescription: disease pressure differs by area and hatchery, so every screen that
// shows it must also show GUIDE_COPY. Ages are days since the chicks arrived (the flock's start date = day 0),
// the same count Farm Hub shows as "Day N".

export const GUIDE_COPY = 'A general guide for Nigerian farms, not a prescription. Your vet may change the dates or add vaccines for your area. Always follow the label on the vaccine or drug.';

export const BIRDS = {
  broilers: { label: 'Broilers', purpose: 'Raised for meat', icon: 'food-drumstick-outline', cycle: 'Ready for sale in about 6 to 8 weeks' },
  layers: { label: 'Layers', purpose: 'Raised for eggs', icon: 'egg-outline', cycle: 'Start laying at about 18 to 20 weeks, and lay for over a year' },
};

// The first four weeks are the same for both types.
const BROODING = [
  { day: 1, kind: 'vaccine', hatchery: true, name: "Marek's + Newcastle (NDV i/o)", against: "Marek's disease, Newcastle disease", route: 'Injection and eye drop',
    note: 'Normally given at the hatchery before you collect the chicks. Ask your supplier what was given; if Newcastle i/o was not, give it by eye drop in the first days.' },
  { day: 1, to: 5, kind: 'drug', name: 'Glucose + multivitamins', against: 'Travel stress, weak chicks', route: 'In drinking water',
    note: 'Glucose on the first day, then vitamins for 3 to 5 days. Repeat vitamins for a day or two after every vaccination.' },
  { day: 7, to: 10, kind: 'vaccine', name: 'Gumboro (IBD) · 1st', against: 'Gumboro disease', route: 'In drinking water' },
  { day: 14, kind: 'vaccine', name: 'Newcastle (Lasota) · 1st', against: 'Newcastle disease', route: 'In drinking water' },
  { day: 21, kind: 'vaccine', name: 'Gumboro (IBD) · 2nd', against: 'Gumboro disease', route: 'In drinking water' },
  { day: 21, to: 28, kind: 'drug', name: 'Coccidiosis watch', against: 'Coccidiosis (bloody droppings, ruffled feathers)', route: 'In drinking water, only if needed',
    note: 'Most starter feeds already contain a coccidiostat. Keep the litter dry. Use a coccidiosis drug such as amprolium only if signs appear or your vet advises it.' },
  { day: 28, kind: 'vaccine', name: 'Newcastle (Lasota) · 2nd', against: 'Newcastle disease', route: 'In drinking water' },
];

export const HEALTH = {
  broilers: [
    ...BROODING,
    { day: 35, toSale: true, kind: 'drug', name: 'Stop drugs before sale', against: 'Drug residue in the meat', route: 'Nothing to give',
      note: 'Observe the withdrawal period on the label (often 5 to 7 days) before you sell or slaughter. Antibiotics only when a vet prescribes them.' },
  ],
  layers: [
    ...BROODING,
    { day: 42, kind: 'vaccine', name: 'Fowl pox', against: 'Fowl pox', route: 'Wing web stab', note: 'Check for a small swelling ("take") at the spot after 7 days.' },
    { day: 49, kind: 'vaccine', name: 'Fowl typhoid', against: 'Fowl typhoid', route: 'Injection under the skin', note: 'Some vets repeat it at 12 to 16 weeks.' },
    { day: 56, kind: 'vaccine', name: 'Newcastle (Komarov) · 1st', against: 'Newcastle disease', route: 'Injection into the muscle',
      note: 'Only for birds that already had Lasota. Never give Komarov to chicks under 6 weeks.' },
    { day: 56, to: 63, kind: 'drug', name: 'Deworming · 1st', against: 'Worms', route: 'In drinking water', note: 'Piperazine or levamisole. Not in the same week as a vaccine if you can avoid it.' },
    { day: 63, to: 70, kind: 'vaccine', name: 'Fowl cholera', against: 'Fowl cholera', route: 'Injection under the skin' },
    { day: 112, kind: 'vaccine', name: 'Newcastle (Komarov) · booster', against: 'Newcastle disease, before laying starts', route: 'Injection into the muscle',
      note: 'Many farms use a killed oil vaccine here instead (Newcastle + infectious bronchitis + egg drop syndrome). Finish all injections before the first eggs.' },
    { day: 112, to: 126, kind: 'drug', name: 'Deworming · before lay', against: 'Worms', route: 'In drinking water', note: 'Then about every 3 months while laying, on your vet\'s advice.' },
    { day: 168, kind: 'vaccine', repeatDays: 56, until: 504, name: 'Newcastle (Lasota) · booster', against: 'Newcastle disease, during lay', route: 'In drinking water',
      note: 'Every 6 to 8 weeks for as long as the birds are laying.' },
    { day: 126, laying: true, kind: 'drug', name: 'Drugs while laying', against: 'Drug residue in the eggs', route: 'Nothing to give',
      note: 'Many drugs must not be given to birds laying eggs for sale. Check the label for the egg withdrawal period and treat only on a vet\'s advice.' },
  ],
};

// Feed by age. `to: null` = until the flock is sold / stops laying. kgPerBird is the rough total for the stage;
// gPerDay is used for the open-ended laying stage.
export const FEEDS = {
  broilers: [
    { from: 0, to: 28, name: 'Broiler starter', form: 'Crumbs or mash', protein: '22 to 23% protein', kgPerBird: 1.3,
      note: 'High protein for fast early growth. Some brands sell a "super starter" or "pre-starter" for the first 1 to 2 weeks.' },
    { from: 29, to: null, endDay: 49, name: 'Broiler finisher', form: 'Pellets or mash', protein: '19 to 20% protein', kgPerBird: 3.2,
      note: 'More energy to add weight until sale. Plan on roughly 4 to 4.5 kg of feed in total per bird to reach 2 kg or more.' },
  ],
  layers: [
    { from: 0, to: 56, name: 'Chick mash', form: 'Mash', protein: '18 to 20% protein', kgPerBird: 2,
      note: 'Weeks 1 to 8. Builds frame and feathers.' },
    { from: 57, to: 126, name: 'Grower mash', form: 'Mash', protein: '15 to 16% protein', kgPerBird: 6,
      note: 'Weeks 9 to 18. Lower protein on purpose: birds that get too fat lay poorly. Keep them on it until the first eggs appear.' },
    { from: 127, to: null, name: 'Layer mash', form: 'Mash or pellets', protein: '16 to 17% protein, with extra calcium', gPerDay: 120,
      note: 'From the first eggs (around week 18 to 20) onwards. About 110 to 125 g per hen each day. The calcium is what makes strong shells.' },
  ],
};

export const FEED_RULES = [
  'Change from one feed to the next over 3 to 5 days, mixing old and new, so the birds don\'t go off feed.',
  'Never give layer mash to young chicks (too much calcium), and don\'t raise layers on broiler feed.',
  'Clean water all day. A bird that stops drinking stops eating.',
  'Store bags off the floor and dry. Don\'t use feed that is mouldy or caked.',
];

// Brands widely sold in Nigeria that make the feeds above. Listed alphabetically; not a ranking or endorsement.
export const FEED_BRANDS = ['Animal Care', 'Chikun', 'Hybrid Feeds', 'New Hope', 'Top Feeds', 'Ultima', 'Vital Feed'];

export const VACCINE_NOTES = [
  'NVRI in Vom, Plateau State, makes most of these: Newcastle i/o, Lasota and Komarov, Gumboro, fowl pox, fowl typhoid and fowl cholera. Buy from NVRI outlets, state veterinary offices or a registered vet shop.',
  'Carry and keep vaccines cold, on ice or in a fridge (2 to 8°C). Check the expiry date. Never use a vial that got warm.',
  'For drinking-water vaccines: take water away for 1 to 2 hours first, use clean water with no chlorine or disinfectant, and let the birds finish it within 2 hours.',
  'Vaccinate only healthy birds, in the cool of the morning or evening.',
];

// What each type produces, so the farmer knows what "on track" looks like.
export const EXPECT = {
  broilers: {
    title: 'Meat: weight you should see', unit: 'Log output in kg sold',
    rows: [['Week 1', '0.15 to 0.2 kg'], ['Week 2', '0.4 to 0.5 kg'], ['Week 3', '0.8 to 0.9 kg'], ['Week 4', '1.2 to 1.5 kg'], ['Week 5', '1.7 to 2.0 kg'], ['Week 6', '2.0 to 2.5 kg'], ['Weeks 7 to 8', '2.5 to 3 kg']],
    note: 'Average live weight per bird with good feed and management. Weigh 10 birds each week and compare. Losses under 5% for the whole cycle is a good result.',
  },
  layers: {
    title: 'Eggs: laying you should see', unit: 'Log output in eggs collected (30 eggs = 1 crate)',
    rows: [['Weeks 1 to 17', 'No eggs: growing'], ['Weeks 18 to 20', 'First eggs, small'], ['Weeks 26 to 30', 'Peak: 8 to 9 eggs a day from every 10 hens'], ['Up to week 72', 'Slowly falls, stays above 7 in 10'], ['After week 72 to 80', 'Sell as spent hens when eggs no longer cover feed']],
    note: 'A good brown layer gives about 280 to 320 eggs in a laying year. A sudden drop in eggs is an early sign of disease, poor feed or stress.',
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
