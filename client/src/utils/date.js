// "2026-10-06 12:34:56" (UTC, from SQLite) -> "6 October 2026" in the user's locale
export function formatDate(sqliteTimestamp) {
  if (!sqliteTimestamp) return '';
  const date = new Date(`${sqliteTimestamp.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

// Today's date as YYYY-MM-DD in the user's own timezone.
export function localDateString(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// "2026-10-03" -> "Sat, 3 October 2026"
export function formatYmd(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// Timeline heading: "Today", "Yesterday", or the full date.
export function dateHeading(ymd) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (ymd === localDateString()) return 'Today';
  if (ymd === localDateString(yesterday)) return 'Yesterday';
  return formatYmd(ymd);
}

// SQLite UTC timestamp -> the user's local YYYY-MM-DD (for grouping history by day)
export function sqliteToLocalYmd(sqliteTimestamp) {
  const date = new Date(`${sqliteTimestamp.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? '' : localDateString(date);
}

// SQLite UTC timestamp -> "3:45 pm" in the user's locale
export function formatTime(sqliteTimestamp) {
  const date = new Date(`${sqliteTimestamp.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}