// "2026-10-06 12:34:56" (UTC, from SQLite) -> "6 October 2026" in the user's locale
export function formatDate(sqliteTimestamp) {
  if (!sqliteTimestamp) return '';
  const date = new Date(`${sqliteTimestamp.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}