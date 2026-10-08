import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fieldErrorsFrom, newIdempotencyKey } from '../api';
import Alert from '../components/Alert';
import Avatar from '../components/Avatar';
import Button, { buttonClass } from '../components/Button';
import Field, { inputClass } from '../components/Field';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { useGroups } from '../context/GroupsContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { localDateString } from '../utils/date';
import { formatInr, minorToString, parseDecimal } from '../utils/money';
import { analyzeSplit } from '../utils/split';

const MAX_AMOUNT_MINOR = 10_000_000_000; // matches the server limit (10 crore rupees)
const CATEGORIES = ['general', 'food', 'groceries', 'stay', 'transport', 'shopping', 'entertainment', 'other'];

const METHODS = [
  { id: 'equal', label: 'Equal', hint: 'Everyone ticked pays the same amount.' },
  { id: 'exact', label: 'Exact', hint: 'Enter how much each person owes. The amounts must add up to the total.' },
  { id: 'percentage', label: 'Percent', hint: 'Enter each person\u2019s percentage. They must add up to 100.' },
  { id: 'custom', label: 'Shares', hint: 'Enter shares. Someone with 2 shares pays double someone with 1.' },
];

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Builds the starting form state for a new expense, or from an existing one when editing.
function initialForm(group, expense, userId) {
  const included = {};
  const values = { exact: {}, percentage: {}, custom: {} };
  group.members.forEach((m) => {
    included[m.id] = !expense;
    values.custom[m.id] = '1';
  });

  if (!expense) {
    return {
      description: '', amount: '', paidBy: String(userId), date: localDateString(),
      category: 'general', method: 'equal', included, values,
    };
  }

  expense.splits.forEach((s) => {
    if (included[s.user_id] === undefined) return; // someone who has left the group
    included[s.user_id] = true;
    if (expense.split_method !== 'equal') values[expense.split_method][s.user_id] = String(s.input_value);
  });
  return {
    description: expense.description,
    amount: expense.amount,
    paidBy: String(expense.paid_by.id),
    date: expense.expense_date,
    category: expense.category,
    method: expense.split_method,
    included,
    values,
  };
}

function ExpenseEditor({ group, expense }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { reload: reloadGroups } = useGroups();
  const editing = Boolean(expense);
  const members = group.members;

  const [form, setForm] = useState(() => initialForm(group, expense, user.id));
  const [errors, setErrors] = useState({});
  const [rowErrors, setRowErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Remembers the key and the exact request body it was used for.
  const keyRef = useRef({ key: newIdempotencyKey(), body: '' });

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const toggle = (id) => setForm((f) => ({ ...f, included: { ...f.included, [id]: !f.included[id] } }));
  const setAll = (checked) => setForm((f) => ({
    ...f, included: Object.fromEntries(members.map((m) => [m.id, checked])),
  }));
  const setValue = (id, text) => setForm((f) => ({
    ...f, values: { ...f.values, [f.method]: { ...f.values[f.method], [id]: text } },
  }));

  const amountMinor = parseDecimal(form.amount, 2);
  const amountValid = amountMinor !== null && amountMinor > 0 && amountMinor <= MAX_AMOUNT_MINOR;
  const analysis = analyzeSplit({
    method: form.method, amountMinor: amountValid ? amountMinor : null,
    members, included: form.included, values: form.values,
  });
  const canSave = form.description.trim() !== '' && amountValid && analysis.valid && form.date !== '' && form.paidBy !== '';

  const amountError = errors.amount
    || (form.amount.trim() && !amountValid ? 'Enter an amount like 1200 or 1200.50' : '');
  const leftTheGroup = editing && expense.splits.some((s) => !(s.user_id in form.included));
  const payerMissing = !members.some((m) => String(m.id) === form.paidBy);
  const categories = CATEGORIES.includes(form.category) ? CATEGORIES : [...CATEGORIES, form.category];
  const method = METHODS.find((m) => m.id === form.method);

  async function onSubmit(e) {
    e.preventDefault();
    if (!canSave) return;

    const chosen = members.filter((m) => form.included[m.id]); // the order the server will index errors by
    const body = {
      description: form.description.trim(),
      category: form.category,
      amount: minorToString(amountMinor),
      paid_by: Number(form.paidBy),
      split_method: form.method,
      expense_date: form.date,
      splits: chosen.map((m) => {
        const text = ((form.values[form.method] && form.values[form.method][m.id]) || '').trim();
        if (form.method === 'equal') return { user_id: m.id };
        return { user_id: m.id, value: form.method === 'custom' ? Number(text) : text };
      }),
    };

    // Same body again (a retry) keeps its key. A changed body gets a new key.
    const bodyText = JSON.stringify(body);
    if (keyRef.current.body !== bodyText) keyRef.current = { key: newIdempotencyKey(), body: bodyText };

    setSubmitting(true);
    setErrors({});
    setRowErrors({});
    setFormError('');
    try {
      if (editing) await api.put(`/expenses/${expense.id}`, body);
      else await api.post(`/groups/${group.id}/expenses`, body, { idempotencyKey: keyRef.current.key });
      reloadGroups(); // balances changed: refresh the sidebar chips and dashboard totals
      toast.success(editing ? 'Expense updated' : 'Expense added');
      navigate(`/groups/${group.id}`);
    } catch (err) {
      const fields = fieldErrorsFrom(err);
      const general = {};
      const perPerson = {};
      Object.entries(fields).forEach(([key, message]) => {
        const match = /^splits\[(\d+)\]\./.exec(key);
        if (match && chosen[Number(match[1])]) perPerson[chosen[Number(match[1])].id] = message;
        else general[key] = message;
      });
      setErrors(general);
      setRowErrors(perPerson);
      setFormError(Object.keys(fields).length === 0 ? err.message : '');
      setSubmitting(false);
    }
  }

  return (
    <div className="anim-rise mx-auto max-w-2xl">
      <Link to={`/groups/${group.id}`} className="inline-flex min-h-8 items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <Icon name="arrowLeft" size={16} /> {group.name}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{editing ? 'Edit expense' : 'Add an expense'}</h1>

      <form onSubmit={onSubmit} noValidate className="mt-5">
        <div className="space-y-4 rounded-card border border-line bg-surface p-4 shadow-soft sm:p-5">
          {formError && <Alert kind="error">{formError}</Alert>}
          {leftTheGroup && (
            <Alert kind="info">
              Someone in this expense has left the group. Choose who shares it now, then save.
            </Alert>
          )}

          <Field
            id="description" label="Description" placeholder="Dinner at the beach shack" maxLength={200}
            autoFocus={!editing} value={form.description} onChange={set('description')} error={errors.description}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="amount" label="Amount (INR)" placeholder="0.00" inputMode="decimal" autoComplete="off"
              value={form.amount} onChange={set('amount')} error={amountError}
            />
            <div>
              <label htmlFor="paid-by" className="mb-1.5 block text-sm font-medium">Paid by</label>
              <select id="paid-by" className={inputClass} value={form.paidBy} onChange={set('paidBy')}>
                {payerMissing && <option value={form.paidBy}>{expense.paid_by.name} (left the group)</option>}
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}{m.id === user.id ? ' (you)' : ''}</option>
                ))}
              </select>
              {errors.paid_by && <p role="alert" className="mt-1.5 text-sm text-owe">{errors.paid_by}</p>}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="date" label="Date" type="date" value={form.date} onChange={set('date')}
              max={localDateString()} error={errors.expense_date}
            />
            <div>
              <label htmlFor="category" className="mb-1.5 block text-sm font-medium">Category</label>
              <select id="category" className={inputClass} value={form.category} onChange={set('category')}>
                {categories.map((c) => <option key={c} value={c}>{capitalize(c)}</option>)}
              </select>
              {errors.category && <p role="alert" className="mt-1.5 text-sm text-owe">{errors.category}</p>}
            </div>
          </div>
        </div>

        <section aria-labelledby="split-heading" className="mt-4 rounded-card border border-line bg-surface shadow-soft">
          <div className="p-4 sm:p-5">
            <h2 id="split-heading" className="font-semibold">How is it split?</h2>
            <div role="radiogroup" aria-label="Split method" className="mt-3 grid grid-cols-4 gap-1 rounded-field bg-sunken p-1">
              {METHODS.map((m) => (
                <button
                  key={m.id} type="button" role="radio" aria-checked={form.method === m.id}
                  onClick={() => setForm((f) => ({ ...f, method: m.id }))}
                  className={`min-h-11 rounded-lg px-1 text-sm font-medium transition-colors ${
                    form.method === m.id ? 'bg-surface text-primary shadow-soft' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm text-ink-muted">{method.hint}</p>
            {(errors.splits || errors.split_method) && (
              <p role="alert" className="mt-2 text-sm text-owe">{errors.splits || errors.split_method}</p>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-sm sm:px-5">
            <span className="text-ink-muted">Who shares this?</span>
            <span className="flex gap-1">
              <button type="button" onClick={() => setAll(true)} className="min-h-9 rounded-field px-2 font-medium text-primary hover:bg-sunken">All</button>
              <button type="button" onClick={() => setAll(false)} className="min-h-9 rounded-field px-2 font-medium text-primary hover:bg-sunken">None</button>
            </span>
          </div>

          <ul className="divide-y divide-line border-t border-line">
            {members.map((m) => {
              const on = Boolean(form.included[m.id]);
              const row = analysis.rows[m.id];
              const rowError = rowErrors[m.id] || (row && row.error);
              return (
                <li key={m.id} className="px-4 py-2 sm:px-5">
                  <div className="flex items-center gap-3">
                    <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox" checked={on} onChange={() => toggle(m.id)}
                        className="size-5 shrink-0 accent-primary"
                      />
                      <Avatar name={m.name} size={32} />
                      <span className="min-w-0 truncate text-sm font-medium">
                        {m.name}{m.id === user.id && <span className="font-normal text-ink-muted"> (you)</span>}
                      </span>
                    </label>

                    {on && form.method === 'equal' && row && row.share !== null && (
                      <span className="money text-sm text-ink-muted">{formatInr(minorToString(row.share))}</span>
                    )}
                    {on && form.method !== 'equal' && (
                      <div className="flex w-28 shrink-0 items-center gap-1.5">
                        {form.method === 'exact' && <span className="text-ink-muted" aria-hidden="true">{'\u20B9'}</span>}
                        <input
                          aria-label={`${m.name}: ${form.method === 'exact' ? 'amount' : form.method === 'percentage' ? 'percentage' : 'shares'}`}
                          inputMode={form.method === 'custom' ? 'numeric' : 'decimal'}
                          autoComplete="off"
                          placeholder={form.method === 'exact' ? '0.00' : form.method === 'percentage' ? '0' : '1'}
                          className={`${inputClass} text-right ${rowError ? 'border-owe' : ''}`}
                          value={(form.values[form.method] && form.values[form.method][m.id]) || ''}
                          onChange={(e) => setValue(m.id, e.target.value)}
                        />
                        {form.method === 'percentage' && <span className="text-ink-muted" aria-hidden="true">%</span>}
                      </div>
                    )}
                  </div>
                  {on && form.method !== 'equal' && form.method !== 'exact' && row && row.share !== null && (
                    <p className="money pb-1 text-right text-xs text-ink-muted">Pays {formatInr(minorToString(row.share))}</p>
                  )}
                  {rowError && <p role="alert" className="pb-1 text-sm text-owe">{rowError}</p>}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Stays visible at the bottom of the screen, above the phone keyboard. */}
        <div className="sticky bottom-0 z-20 -mx-4 mt-4 border-t border-line bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:mx-0 sm:rounded-card sm:border sm:pb-3 sm:shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <p
              role="status" aria-live="polite"
              className={`flex min-w-0 items-center gap-2 text-sm font-medium ${
                analysis.tone === 'ok' ? 'text-gain' : analysis.tone === 'warn' ? 'text-owe' : 'text-ink-muted'
              }`}
            >
              <Icon name={analysis.tone === 'ok' ? 'check' : analysis.tone === 'warn' ? 'alert' : 'info'} size={18} />
              <span className="money">{analysis.text}</span>
            </p>
            <div className="flex shrink-0 gap-2">
              <Link to={`/groups/${group.id}`} className={`${buttonClass('secondary')} hidden sm:inline-flex`}>Cancel</Link>
              <Button type="submit" loading={submitting} disabled={!canSave}>
                {editing ? 'Save changes' : 'Add expense'}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function ExpenseForm() {
  const { id, expenseId } = useParams();
  const { user } = useAuth();
  const groupReq = useFetch(`/groups/${id}`);
  const expenseReq = useFetch(expenseId ? `/expenses/${expenseId}` : null);

  const loading = (groupReq.loading && !groupReq.data) || (expenseId && expenseReq.loading && !expenseReq.data);
  const error = groupReq.error || expenseReq.error;
  const back = (
    <Link to={`/groups/${id}`} className="mt-1 inline-block font-medium underline">Back</Link>
  );

  if (loading) {
    return (
      <div aria-hidden="true" className="mx-auto max-w-2xl space-y-4">
        <div className="h-8 w-1/2 animate-pulse rounded-field bg-sunken" />
        <div className="h-72 animate-pulse rounded-card bg-sunken" />
        <div className="h-64 animate-pulse rounded-card bg-sunken" />
      </div>
    );
  }
  if (error || !groupReq.data) {
    return <div className="mx-auto max-w-lg py-10"><Alert kind="error"><p>{error ? error.message : 'Could not load this page.'}</p>{back}</Alert></div>;
  }

  const group = groupReq.data.group;
  const expense = expenseId ? expenseReq.data && expenseReq.data.expense : null;

  if (expenseId) {
    if (!expense || expense.group_id !== group.id) {
      return <div className="mx-auto max-w-lg py-10"><Alert kind="error"><p>Expense not found in this group.</p>{back}</Alert></div>;
    }
    if (expense.created_by !== user.id && group.my_role !== 'admin') {
      return (
        <div className="mx-auto max-w-lg py-10">
          <Alert kind="error"><p>Only the person who created this expense or a group admin can edit it.</p>{back}</Alert>
        </div>
      );
    }
  }

  return <ExpenseEditor key={`${group.id}-${expenseId || 'new'}`} group={group} expense={expense} />;
}