/*
 * MONEY RULES
 *  - Everything is stored and calculated as an INTEGER number of paise
 *    (1 rupee = 100 paise). 100.50 rupees is 10050.
 *  - Text is converted to paise by parsing digits, never by multiplying a float.
 *    (In JS, 1.15 * 100 = 114.99999999999999, which is why floats are unsafe.)
 *  - Floats are never used to calculate; they only appear nowhere in this file.
 */

const MAX_AMOUNT_MINOR = 10_000_000_000; // 10 crore rupees per expense

// Parses a decimal such as "1200.50", "7" or 12.5 into an integer scaled by
// 10^decimals. Returns null for anything else (negative, 3 decimals, "1e5", "abc").
// decimals = 2 for rupees->paise and for percent->basis points (33.33% = 3333).
function parseDecimalToInt(value, decimals) {
  let text;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    text = String(value); // 1e21 becomes "1e+21", which the regex below rejects
  } else if (typeof value === 'string') {
    text = value.trim();
  } else {
    return null;
  }

  const match = new RegExp(`^(\\d{1,12})(?:\\.(\\d{1,${decimals}}))?$`).exec(text);
  if (!match) return null;

  const whole = Number(match[1]);
  const fraction = (match[2] || '').padEnd(decimals, '0'); // "5" -> "50"
  return whole * 10 ** decimals + Number(fraction);
}

// "1200.50" -> 120050. Returns null if the text is not a valid amount.
const parseMoney = (value) => parseDecimalToInt(value, 2);

// Internal: 120050 -> "1200.50" (also used for basis points: 3333 -> "33.33")
function formatFixed2(minor) {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0');
  return `${sign}${whole}.${fraction}`;
}

const formatMinor = formatFixed2;          // paise -> "1200.50"
const formatBasisPoints = formatFixed2;    // basis points -> "33.33"

// Indian digit grouping for display: 12345678 paise -> "₹1,23,456.78"
function formatINR(minor) {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const whole = String(Math.floor(abs / 100));
  const fraction = String(abs % 100).padStart(2, '0');

  let grouped = whole;
  if (whole.length > 3) {
    const lastThree = whole.slice(-3);
    const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    grouped = `${rest},${lastThree}`;
  }
  return `${sign}\u20B9${grouped}.${fraction}`;
}

/*
 * Splits totalMinor into parts proportional to `weights`, using the
 * LARGEST-REMAINDER method, so that the parts add up EXACTLY to totalMinor.
 *
 * Example: 1000.00 (100000 paise) among 3 equal weights
 *   each gets floor(100000 / 3) = 33333, leaving 1 paisa over.
 *   The paisa goes to the part with the largest fractional remainder; ties go
 *   to the earliest part. Result: [33334, 33333, 33333]  (sums to 100000).
 *
 * Plain rounding would give 33333 x 3 = 99999 and lose a paisa.
 * Weights must be non-negative integers with a positive sum.
 */
function allocateProportionally(totalMinor, weights) {
  const total = BigInt(totalMinor);
  const w = weights.map((x) => BigInt(x));
  const weightSum = w.reduce((a, b) => a + b, 0n);
  if (weightSum <= 0n) throw new Error('Weights must have a positive sum');

  const parts = w.map((weight, index) => ({
    index,
    base: (total * weight) / weightSum,       // BigInt division rounds down
    remainder: (total * weight) % weightSum,  // what the rounding dropped
  }));

  let leftover = total - parts.reduce((sum, p) => sum + p.base, 0n); // < number of parts

  // Biggest remainder first; equal remainders keep their original order.
  const order = [...parts].sort((a, b) => {
    if (a.remainder === b.remainder) return a.index - b.index;
    return a.remainder > b.remainder ? -1 : 1;
  });
  for (let i = 0; leftover > 0n; i += 1, leftover -= 1n) {
    order[i].base += 1n;
  }

  return parts.map((p) => Number(p.base));
}

module.exports = {
  MAX_AMOUNT_MINOR,
  parseDecimalToInt,
  parseMoney,
  formatMinor,
  formatBasisPoints,
  formatINR,
  allocateProportionally,
};