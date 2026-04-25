export function uid(prefix = 'id') {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function todayKey(ts = Date.now()) {
  const d = new Date(ts);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function formatElapsed(ms) {
  const seconds = Math.max(0, Math.round((ms || 0) / 1000));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/* Round to the nearest minute for the summary ribbon sub-row. Durations
   shorter than 30 seconds read as "<1 min" so the label stays honest for
   micro-rounds. Anything at or above 30 seconds rounds up to at least
   "1 min" (never zero) so a completed round always shows non-zero time. */
export function formatElapsedMinutes(ms) {
  const safe = Math.max(0, Number(ms) || 0);
  if (safe < 30_000) return '<1 min';
  const mins = Math.max(1, Math.round(safe / 60_000));
  return `${mins} min`;
}

export function average(numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) return 0;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

export function wordsLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function safeParseInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function removeAt(array, index) {
  return array.filter((_, currentIndex) => currentIndex !== index);
}
