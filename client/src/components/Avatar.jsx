const COLORS = ['#B5532F', '#1F7A6D', '#8A5A9E', '#9A6F1E', '#3F6FA8', '#B24A6A'];

function pickColor(name) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 100000;
  return COLORS[hash % COLORS.length];
}

function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const second = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + second).toUpperCase();
}

export default function Avatar({ name = '', size = 36 }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, backgroundColor: pickColor(name), fontSize: Math.round(size * 0.4) }}
    >
      {initials(name)}
    </span>
  );
}