import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) console.warn('Poultry360 Ops: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in apps/admin/.env');

export const supabase = createClient(url || 'http://localhost', key || 'missing');

// Turns Postgres "raise exception 'CODE'" messages into readable copy.
const MESSAGES = {
  NOT_ADMIN: "This account isn't an ops admin.",
  REASON_REQUIRED: 'Give the farm a reason so they know what to fix.',
  NOT_FOUND: 'That farm no longer exists.',
  INVALID_STATUS: 'Unknown verification status.',
  INVALID_EMAIL: 'Enter a valid email address.',
  NAME_REQUIRED: "Enter the rider's name.",
  INVALID_PHONE: 'Enter a Nigerian number, e.g. 0803 123 4567.',
  EMAIL_TAKEN: 'Another rider already uses this email.',
  PHONE_TAKEN: 'Another rider already uses this phone number.',
  NOT_FUNDED: 'This can only be started once it is fully funded.',
  NOT_ACTIVE: 'Returns can only be paid while the term is active.',
  NO_INVESTORS: 'There are no active investors to pay.',
  FARM_INSUFFICIENT: "The farm's wallet doesn't hold enough to cover this payout.",
  ALLOCATION_NOT_100: 'Farm allocations must add up to 100%.',
  FARM_NOT_VERIFIED: 'Every farm in a pool must be a verified seller with an approved badge.',
  INVALID_AMOUNT: 'Enter an amount of zero or more.',
};
export function friendlyError(e) {
  const m = (e && (e.message || e.error_description)) || String(e || 'Something went wrong');
  const code = Object.keys(MESSAGES).find((k) => m.includes(k));
  if (code) return MESSAGES[code];
  if (/failed to fetch|network/i.test(m)) return "Can't reach Supabase. Check your connection and try again.";
  return m;
}

export async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}
