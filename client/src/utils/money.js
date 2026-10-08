function groupIndian(digits) {
  if (digits.length <= 3) return digits;
  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${lastThree}`;
}

// "1234567.5" -> "₹12,34,567.50"   "-775.00" -> "-₹775.00"
export function formatInr(value) {
  const text = String(value);
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  return `${negative ? '-' : ''}\u20B9${groupIndian(whole || '0')}.${fraction.padEnd(2, '0')}`;
}

// "1200.50" -> 120050. Parses digits, never multiplies a float. Returns null if invalid.
// decimals = 2 for rupees -> paise and for percent -> basis points (33.33% = 3333).
export function parseDecimal(value, decimals = 2) {
  const match = new RegExp(`^(\\d{1,12})(?:\\.(\\d{1,${decimals}}))?$`).exec(String(value).trim());
  if (!match) return null;
  return Number(match[1]) * 10 ** decimals + Number((match[2] || '').padEnd(decimals, '0'));
}

// 120050 -> "1200.50"
export function minorToString(minor) {
  const abs = Math.abs(minor);
  return `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// Same largest-remainder method as the server: the parts always add up to the total exactly.
export function allocate(totalMinor, weights) {
  const total = BigInt(totalMinor);
  const w = weights.map((x) => BigInt(x));
  const weightSum = w.reduce((a, b) => a + b, 0n);
  if (weightSum <= 0n) return weights.map(() => 0);

  const parts = w.map((weight, index) => ({
    index,
    base: (total * weight) / weightSum,
    remainder: (total * weight) % weightSum,
  }));
  let leftover = total - parts.reduce((sum, p) => sum + p.base, 0n);

  const order = [...parts].sort((a, b) => {
    if (a.remainder === b.remainder) return a.index - b.index;
    return a.remainder > b.remainder ? -1 : 1;
  });
  for (let i = 0; leftover > 0n; i += 1, leftover -= 1n) order[i].base += 1n;

  return parts.map((p) => Number(p.base));
}