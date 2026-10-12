export const naira = (n, opts = {}) => {
  const v = Number(n || 0);
  const s = Math.abs(v).toLocaleString('en-NG', { maximumFractionDigits: opts.decimals ?? 0, minimumFractionDigits: opts.decimals ?? 0 });
  return (v < 0 ? '−' : opts.sign && v > 0 ? '+' : '') + '₦' + s;
};

export const pad = (n) => String(n).padStart(2, '0');

export function countdown(deadline, now = Date.now()) {
  const ms = new Date(deadline).getTime() - now;
  if (ms <= 0) return { done: true, text: '00:00:00', ms: 0 };
  const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4), s = Math.floor((ms % 6e4) / 1000);
  return { done: false, text: pad(h) + ':' + pad(m) + ':' + pad(s), ms };
}

export function timeAgo(d) {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

export const shortDate = (d) => new Date(d).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });
export const clock = (d) => new Date(d).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false });
export const isoDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

// Accepts 0803..., 803..., +234803..., returns E.164 or null.
export function normalizeNgPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  let local = d;
  if (local.startsWith('234')) local = local.slice(3);
  if (local.startsWith('0')) local = local.slice(1);
  return /^[789][01]\d{8}$/.test(local) ? '+234' + local : null;
}

export function normalizeEmail(raw) {
  const e = String(raw || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}

export const pct = (n, d = 0) => Number(n || 0).toFixed(d) + '%';
export const INVEST_STATUS = { draft: 'Draft', pending_review: 'In review', open: 'Open', funded: 'Fully funded',
  active: 'Active', matured: 'Matured', refunded: 'Refunded', suspended: 'Paused', rejected: 'Changes needed' };

export const STATUS_LABEL = {
  placed: 'Awaiting farm', confirmed: 'Preparing', ready: 'Ready for pickup', picked_up: 'Picked up',
  out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled', refunded: 'Refunded', flagged: 'Flagged',
};
export const ORDER_STEPS = ['placed', 'confirmed', 'ready', 'picked_up', 'out_for_delivery', 'delivered'];
