// Display helpers. Every weight in the app is stored in kilograms; conversion
// happens here and nowhere else.

export const UNITS = {
  lb: { label: 'lb', perKg: 2.20462262, step: 5 },
  kg: { label: 'kg', perKg: 1, step: 2.5 },
};

export function fromKg(kg, unit) {
  return kg * UNITS[unit].perKg;
}

export function toKg(value, unit) {
  return value / UNITS[unit].perKg;
}

/** The number alone — for tables and inline summaries where a unit on every value is noise. */
export function weightValue(kg, unit) {
  const converted = Math.round(fromKg(kg, unit) * 10) / 10;
  return Number.isInteger(converted) ? String(converted) : converted.toFixed(1);
}

export function weight(kg, unit) {
  return `${weightValue(kg, unit)} ${UNITS[unit].label}`;
}

/** Volume gets abbreviated past 10k so it fits a stat tile. */
export function volume(kg, unit) {
  const converted = fromKg(kg, unit);
  if (converted >= 10000) return `${(converted / 1000).toFixed(1)}k ${UNITS[unit].label}`;
  return `${Math.round(converted)} ${UNITS[unit].label}`;
}

/** "5:12" below an hour, "1:05:12" past it — how a rest timer reads. */
export function duration(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function shortDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const DAY = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const FULL = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const MONTH = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

export const formatDay = (d) => DAY.format(new Date(d));
export const formatFullDate = (d) => FULL.format(new Date(d));
export const formatMonth = (d) => MONTH.format(new Date(d));

/** "2h ago", "yesterday" — used for the resume banner. */
export function relative(from, now = Date.now()) {
  const seconds = Math.max(0, (now - new Date(from).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  const days = Math.floor(seconds / 86400);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

/** Escapes user-entered text before it goes into innerHTML. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
