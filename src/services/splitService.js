const { badRequest } = require('../utils/errors');
const money = require('./../utils/money');

const SPLIT_METHODS = ['equal', 'exact', 'percentage', 'custom'];
const MAX_CUSTOM_WEIGHT = 10000;
const FULL_PERCENT_BP = 10000; // 100.00% in basis points

/*
 * computeSplit validates the split input and returns the final shares.
 *
 *   method          'equal' | 'exact' | 'percentage' | 'custom'
 *   amountMinor     expense total in paise
 *   splits          [{ user_id, value }] from the request (optional for 'equal')
 *   activeMemberIds ids of everybody currently in the group
 *
 * Returns [{ userId, shareMinor, splitValue }] sorted by userId, where
 * the shareMinor values always add up exactly to amountMinor.
 * Throws a 400 listing every problem found.
 */
function computeSplit({ method, amountMinor, splits, activeMemberIds }) {
  const errors = [];
  const active = new Set(activeMemberIds);

  // ---- 1. Work out who participates ----
  let entries;
  if (splits === undefined || splits === null) {
    if (method !== 'equal') {
      throw badRequest('Validation failed', [
        { field: 'splits', message: `splits are required for a ${method} split` },
      ]);
    }
    entries = activeMemberIds.map((id) => ({ user_id: id })); // equal among everyone
  } else if (Array.isArray(splits)) {
    entries = splits;
  } else {
    throw badRequest('Validation failed', [{ field: 'splits', message: 'splits must be an array' }]);
  }

  const seen = new Set();
  const participants = [];
  entries.forEach((entry, index) => {
    const field = `splits[${index}].user_id`;
    const userId = entry && entry.user_id;

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      errors.push({ field, message: 'user_id must be a positive integer' });
    } else if (seen.has(userId)) {
      errors.push({ field, message: `user ${userId} appears more than once` });
    } else if (!active.has(userId)) {
      errors.push({ field, message: `user ${userId} is not an active member of this group` });
    } else {
      seen.add(userId);
      participants.push({ index, userId, raw: entry.value, shareMinor: 0, splitValue: null });
    }
  });

  if (errors.length === 0 && participants.length === 0) {
    errors.push({ field: 'splits', message: 'At least one participant is required' });
  }
  if (errors.length > 0) throw badRequest('Validation failed', errors);

  // Sorted by user id so the same people always get the same result.
  participants.sort((a, b) => a.userId - b.userId);

  const valueError = (p, message) => errors.push({ field: `splits[${p.index}].value`, message });

  // ---- 2. Compute shares for the chosen method ----
  switch (method) {
    case 'equal': {
      const shares = money.allocateProportionally(amountMinor, participants.map(() => 1));
      participants.forEach((p, i) => { p.shareMinor = shares[i]; });
      break;
    }

    case 'exact': {
      // Each person's exact amount is given; they must add up to the total.
      let sum = 0;
      participants.forEach((p) => {
        const minor = money.parseMoney(p.raw);
        if (minor === null || minor <= 0) {
          valueError(p, 'Amount must be a positive number with at most 2 decimals');
        } else {
          p.shareMinor = minor;
          sum += minor;
        }
      });
      if (errors.length === 0 && sum !== amountMinor) {
        errors.push({
          field: 'splits',
          message: `Exact amounts add up to ${money.formatMinor(sum)} but the expense total is ${money.formatMinor(amountMinor)}`,
        });
      }
      break;
    }

    case 'percentage': {
      // Percentages are stored as basis points (33.33% = 3333) so they stay integers.
      let sumBp = 0;
      participants.forEach((p) => {
        const bp = money.parseDecimalToInt(p.raw, 2);
        if (bp === null || bp <= 0 || bp > FULL_PERCENT_BP) {
          valueError(p, 'Percentage must be above 0 and at most 100, with at most 2 decimals');
        } else {
          p.splitValue = bp;
          sumBp += bp;
        }
      });
      if (errors.length === 0) {
        if (sumBp !== FULL_PERCENT_BP) {
          errors.push({
            field: 'splits',
            message: `Percentages add up to ${money.formatBasisPoints(sumBp)} but must add up to exactly 100`,
          });
        } else {
          const shares = money.allocateProportionally(amountMinor, participants.map((p) => p.splitValue));
          participants.forEach((p, i) => { p.shareMinor = shares[i]; });
        }
      }
      break;
    }

    case 'custom': {
      // Custom = integer weights ("shares"): weight 2 pays double a weight of 1.
      participants.forEach((p) => {
        const isWholeNumber =
          Number.isInteger(p.raw) || (typeof p.raw === 'string' && /^\d+$/.test(p.raw.trim()));
        const weight = isWholeNumber ? Number(p.raw) : NaN;
        if (!Number.isInteger(weight) || weight < 1 || weight > MAX_CUSTOM_WEIGHT) {
          valueError(p, `Weight must be a whole number from 1 to ${MAX_CUSTOM_WEIGHT}`);
        } else {
          p.splitValue = weight;
        }
      });
      if (errors.length === 0) {
        const shares = money.allocateProportionally(amountMinor, participants.map((p) => p.splitValue));
        participants.forEach((p, i) => { p.shareMinor = shares[i]; });
      }
      break;
    }

    default:
      errors.push({ field: 'split_method', message: `split_method must be one of: ${SPLIT_METHODS.join(', ')}` });
  }

  if (errors.length > 0) throw badRequest('Validation failed', errors);

  // Final safety net: shares must add up exactly to the expense total.
  const total = participants.reduce((sum, p) => sum + p.shareMinor, 0);
  if (total !== amountMinor) {
    throw new Error(`Split invariant broken: shares ${total} != amount ${amountMinor}`);
  }

  return participants.map((p) => ({ userId: p.userId, shareMinor: p.shareMinor, splitValue: p.splitValue }));
}

module.exports = { SPLIT_METHODS, computeSplit };