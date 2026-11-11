// What the buyer's live-order cards say (Home Hearth, tracking ETA Hearth). Pure.
import { distanceKm, rideMinutes, kmLabel } from './nearby';

export const ORDER_FLOW = ['placed', 'confirmed', 'ready', 'picked_up', 'out_for_delivery', 'delivered'];
export const ACTIVE = ['placed', 'confirmed', 'ready', 'picked_up', 'out_for_delivery'];

// "2 to 6 PM" today before 1 PM, else tomorrow's morning window.
export function deliveryWindow(now = new Date()) {
  return now.getHours() < 13 ? { day: 'Today', time: '2 to 6 PM' } : { day: 'Tomorrow', time: '10 AM to 2 PM' };
}
export const timeOfDay = (d) => new Date(d).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?([ap])\.?m\.?/i, (m, x) => ' ' + x.toUpperCase() + 'M');
export const firstName = (n) => (n || '').trim().split(/\s+/)[0] || '';

const TITLE = { placed: 'Waiting for the seller', confirmed: 'Being packed', ready: 'Ready for pickup', picked_up: 'Picked up', out_for_delivery: 'On the way', delivered: 'Delivered' };
const LINE = { placed: 'The seller has 24 hours to accept, or you are refunded.', confirmed: 'Your order is being packed.', ready: 'A rider is being sent to collect it.' };

const itemsShort = (items) => (items || []).map((i) => i.qty + ' × ' + i.title).join(', ');

// From order_detail: the part of the order furthest from done, and what to say about it.
export function liveOrder(o, now = Date.now()) {
  if (!o) return null;
  const subs = (o.subs || []).filter((s) => ACTIVE.includes(s.status));
  if (!subs.length) return null;
  const sub = subs.sort((a, b) => ORDER_FLOW.indexOf(b.status) - ORDER_FLOW.indexOf(a.status))[0];
  const step = ORDER_FLOW.indexOf(sub.status);
  const a = sub.assignment;
  const rider = a?.rider && ['accepted', 'at_farm', 'picked_up', 'at_buyer'].includes(a.status) ? a.rider : null;
  const moving = rider && ['picked_up', 'out_for_delivery'].includes(sub.status) && rider.lat != null;
  const km = moving ? distanceKm(rider, o.address) : null;
  const win = deliveryWindow(new Date(o.created_at));
  if (km != null) {
    const mins = rideMinutes(km);
    return { sub, step, rider, km, mins, title: TITLE[sub.status], label: 'Arriving', big: timeOfDay(now + mins * 60000),
      line: firstName(rider.name) + ' is ' + kmLabel(km) + ' away with ' + itemsShort(sub.items), sub_line: 'About ' + mins + ' minutes · ' + kmLabel(km) + ' away' };
  }
  return { sub, step, rider, km: null, mins: null, title: TITLE[sub.status], label: 'Arriving ' + win.day.toLowerCase(), big: win.time,
    line: rider && sub.status === 'ready' ? firstName(rider.name) + ' is heading to the seller.' : LINE[sub.status] || itemsShort(sub.items), sub_line: win.day + ', ' + win.time };
}
