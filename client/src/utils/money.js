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