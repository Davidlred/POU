// Flock history maths: pure functions, no I/O. Closing a flock never deletes anything;
// these turn its stored logs into a lifetime record and feed the dashboard.

const day = (d) => { const x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const num = (n) => Number(n || 0);

export const isClosed = (flock) => flock.status === 'inactive';

// The last day of a flock's life: today while it is running, otherwise the day it was closed
// (never earlier than its last entry, in case entries were added after closing).
export function flockEnd(flock, logs, today = day(new Date())) {
  if (!isClosed(flock)) return today;
  const last = logs.filter((l) => l.flock_id === flock.id).reduce((m, l) => (l.log_date > m ? l.log_date : m), flock.start_date);
  const closed = flock.updated_at ? day(flock.updated_at) : last;
  return closed > last ? closed : last;
}

// Everything that happened to one flock, from its first day to its last.
export function flockSummary(flock, logs, today = day(new Date())) {
  const mine = logs.filter((l) => l.flock_id === flock.id);
  const of = (kind) => mine.filter((l) => l.kind === kind);
  const sum = (rows, key) => rows.reduce((s, l) => s + num(l[key]), 0);
  const end = flockEnd(flock, logs, today);
  const days = Math.max(0, Math.round((new Date(end) - new Date(flock.start_date)) / 864e5));
  const dead = sum(of('mortality'), 'quantity');
  const expenses = of('expense');
  const vetCost = sum(expenses.filter((l) => l.cause === 'Vet & drugs'), 'cost');
  const feedCost = sum(of('feed'), 'cost');
  const otherCost = sum(expenses, 'cost') - vetCost;
  return {
    closed: isClosed(flock), start: flock.start_date, end, days, weeks: Math.floor(days / 7) + 1,
    started: num(flock.size), dead, remaining: Math.max(0, num(flock.size) - dead), mortality: num(flock.size) ? (dead / num(flock.size)) * 100 : 0,
    feedKg: sum(of('feed'), 'quantity'), feedCost,
    output: sum(of('production'), 'quantity'), outputUnit: flock.type === 'layers' ? 'eggs' : 'kg',
    vetCost, otherCost, totalCost: feedCost + vetCost + otherCost,
    entries: mine.length,
  };
}

// Splits [from, to] into equal slices and totals value(row) in each: the bars for a chart of any length of time.
export function series(rows, value, from, to, buckets = 14) {
  const a = new Date(from).getTime(), b = new Date(to).getTime() + 864e5;   // include the last day
  const span = Math.max(864e5, b - a);
  const n = Math.max(1, Math.min(buckets, Math.round(span / 864e5)));
  const out = Array(n).fill(0);
  rows.forEach((l) => {
    const t = new Date(l.log_date).getTime();
    if (t < a || t >= b) return;
    out[Math.min(n - 1, Math.floor(((t - a) / span) * n))] += num(value(l));
  });
  return out;
}

// Farm-wide totals for the dashboard. since = 'YYYY-MM-DD' or null for all time. Closed flocks count like any other.
export function farmTotals(flocks, logs, since, today = day(new Date())) {
  const rows = since ? logs.filter((l) => l.log_date >= since) : logs;
  const ids = new Set(flocks.map((f) => f.id));
  const mine = rows.filter((l) => ids.has(l.flock_id));
  const type = Object.fromEntries(flocks.map((f) => [f.id, f.type]));
  const sum = (list, key) => list.reduce((s, l) => s + num(l[key]), 0);
  const kind = (k) => mine.filter((l) => l.kind === k);
  const expenses = kind('expense');
  const vet = sum(expenses.filter((l) => l.cause === 'Vet & drugs'), 'cost');
  const feed = sum(kind('feed'), 'cost');
  const other = sum(expenses, 'cost') - vet;
  const prod = kind('production');
  return {
    feed, vet, other, costs: feed + vet + other,
    feedKg: sum(kind('feed'), 'quantity'),
    eggs: sum(prod.filter((l) => type[l.flock_id] === 'layers'), 'quantity'),
    meatKg: sum(prod.filter((l) => type[l.flock_id] !== 'layers'), 'quantity'),
    dead: sum(kind('mortality'), 'quantity'),
    // One line per flock that had any activity in the period (or is still running), busiest first.
    byFlock: flocks.map((f) => {
      const fl = mine.filter((l) => l.flock_id === f.id);
      return { flock: f, closed: isClosed(f), cost: sum(fl, 'cost'), output: sum(fl.filter((l) => l.kind === 'production'), 'quantity'),
        outputUnit: f.type === 'layers' ? 'eggs' : 'kg', dead: sum(fl.filter((l) => l.kind === 'mortality'), 'quantity'), entries: fl.length, end: flockEnd(f, logs, today) };
    }).filter((x) => x.entries || !x.closed).sort((a, b) => (a.closed === b.closed ? (a.end < b.end ? 1 : -1) : a.closed ? 1 : -1)),
  };
}
