import { allocate, formatInr, minorToString, parseDecimal } from './money';

const FULL_PERCENT_BP = 10000; // 100.00%
const MAX_WEIGHT = 10000;

/*
 * method      'equal' | 'exact' | 'percentage' | 'custom'
 * amountMinor expense total in paise, or null if the amount field is not valid yet
 * included    { [userId]: boolean }
 * values      { exact: {[userId]: text}, percentage: {...}, custom: {...} }
 *
 * Returns { valid, tone: 'ok' | 'warn' | 'neutral', text, rows: { [userId]: { share, error } } }
 */
export function analyzeSplit({ method, amountMinor, members, included, values }) {
  // Sorted by id, exactly like the server, so remainder paise land on the same people.
  const chosen = members.filter((m) => included[m.id]).sort((a, b) => a.id - b.id);
  const rows = {};
  chosen.forEach((m) => { rows[m.id] = { share: null, error: '' }; });
  const result = (valid, tone, text) => ({ valid, tone, text, rows });

  if (chosen.length === 0) return result(false, 'warn', 'Select at least one person');

  const hasAmount = amountMinor !== null;
  const typed = (m) => ((values[method] && values[method][m.id]) || '').trim();

  if (method === 'equal') {
    if (hasAmount) {
      const shares = allocate(amountMinor, chosen.map(() => 1));
      chosen.forEach((m, i) => { rows[m.id].share = shares[i]; });
    }
    const n = chosen.length;
    return hasAmount
      ? result(true, 'ok', `Split equally among ${n} ${n === 1 ? 'person' : 'people'}`)
      : result(false, 'neutral', 'Enter the amount to see each share');
  }

  if (method === 'exact') {
    let sum = 0;
    let incomplete = false;
    chosen.forEach((m) => {
      const text = typed(m);
      const minor = parseDecimal(text, 2);
      if (minor === null || minor <= 0) {
        incomplete = true;
        if (text) rows[m.id].error = 'Enter an amount above 0 with at most 2 decimals';
      } else {
        rows[m.id].share = minor;
        sum += minor;
      }
    });
    if (!hasAmount) return result(false, 'neutral', 'Enter the amount first');
    const remaining = amountMinor - sum;
    if (remaining > 0) return result(false, 'warn', `${formatInr(minorToString(remaining))} left to allocate`);
    if (remaining < 0) return result(false, 'warn', `${formatInr(minorToString(-remaining))} over the total`);
    if (incomplete) return result(false, 'warn', 'Enter an amount for everyone selected');
    return result(true, 'ok', 'Fully allocated');
  }

  if (method === 'percentage') {
    let sumBp = 0;
    let incomplete = false;
    const weights = [];
    chosen.forEach((m) => {
      const text = typed(m);
      const bp = parseDecimal(text, 2);
      if (bp === null || bp <= 0 || bp > FULL_PERCENT_BP) {
        incomplete = true;
        weights.push(0);
        if (text) rows[m.id].error = 'Enter a percentage above 0, with at most 2 decimals';
      } else {
        weights.push(bp);
        sumBp += bp;
      }
    });
    const remaining = FULL_PERCENT_BP - sumBp;
    if (remaining === 0 && !incomplete && hasAmount) {
      const shares = allocate(amountMinor, weights);
      chosen.forEach((m, i) => { rows[m.id].share = shares[i]; });
      return result(true, 'ok', '100% allocated');
    }
    if (remaining > 0) return result(false, 'warn', `${minorToString(remaining)}% left to allocate`);
    if (remaining < 0) return result(false, 'warn', `${minorToString(-remaining)}% over 100%`);
    if (incomplete) return result(false, 'warn', 'Enter a percentage for everyone selected');
    return result(false, 'neutral', '100% allocated. Enter the amount to finish');
  }

  // custom: whole-number shares, e.g. 2 pays double 1
  let totalWeight = 0;
  let incomplete = false;
  const weights = [];
  chosen.forEach((m) => {
    const text = typed(m);
    const weight = /^\d+$/.test(text) ? Number(text) : NaN;
    if (!Number.isInteger(weight) || weight < 1 || weight > MAX_WEIGHT) {
      incomplete = true;
      weights.push(0);
      if (text) rows[m.id].error = `Enter a whole number from 1 to ${MAX_WEIGHT}`;
    } else {
      weights.push(weight);
      totalWeight += weight;
    }
  });
  if (incomplete) return result(false, 'warn', 'Enter the number of shares for everyone selected');
  if (!hasAmount) return result(false, 'neutral', `${totalWeight} shares in total. Enter the amount to finish`);
  const shares = allocate(amountMinor, weights);
  chosen.forEach((m, i) => { rows[m.id].share = shares[i]; });
  return result(true, 'ok', `${totalWeight} shares in total`);
}