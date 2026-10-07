import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import Alert from '../../components/Alert';
import Avatar from '../../components/Avatar';
import Button, { buttonClass } from '../../components/Button';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { useAuth } from '../../context/AuthContext';
import { useGroups } from '../../context/GroupsContext';
import { useToast } from '../../context/ToastContext';
import { dateHeading, formatYmd } from '../../utils/date';
import { formatInr } from '../../utils/money';

const PAGE_SIZE = 30;

const METHOD_LABEL = {
  equal: 'Split equally',
  exact: 'Exact amounts',
  percentage: 'By percentage',
  custom: 'By shares',
};

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Expenses arrive newest first, so equal dates are always next to each other.
function groupByDate(expenses) {
  const days = [];
  for (const expense of expenses) {
    const last = days[days.length - 1];
    if (last && last.date === expense.expense_date) last.items.push(expense);
    else days.push({ date: expense.expense_date, items: [expense] });
  }
  return days;
}

function ExpenseRow({ expense, userId, onOpen }) {
  const mine = expense.splits.find((s) => s.user_id === userId);
  const payer = expense.paid_by.id === userId ? 'You' : expense.paid_by.name;
  return (
    <button
      type="button"
      onClick={() => onOpen(expense)}
      className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-sunken"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon name="receipt" size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{expense.description}</span>
        <span className="block truncate text-sm text-ink-muted">
          {payer} paid {'\u00B7'} {capitalize(expense.category)}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="money block font-semibold">{formatInr(expense.amount)}</span>
        <span className="money block text-xs text-ink-muted">
          {mine ? `Your share ${formatInr(mine.share)}` : 'Not in this split'}
        </span>
      </span>
    </button>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-medium">{children}</dd>
    </div>
  );
}

function splitNote(method, split) {
  if (method === 'percentage') return `${split.input_value}%`;
  if (method === 'custom') return `${split.input_value} share${Number(split.input_value) === 1 ? '' : 's'}`;
  return null;
}

function ExpenseDetails({ expense, userId, canModify, groupId, onClose, onDelete }) {
  return (
    <Modal onClose={onClose} title={expense.description}>
      <p className="money text-3xl font-semibold tracking-tight">{formatInr(expense.amount)}</p>

      <dl className="mt-3 divide-y divide-line border-y border-line">
        <DetailRow label="Paid by">{expense.paid_by.id === userId ? 'You' : expense.paid_by.name}</DetailRow>
        <DetailRow label="Date">{formatYmd(expense.expense_date)}</DetailRow>
        <DetailRow label="Category">{capitalize(expense.category)}</DetailRow>
        <DetailRow label="Split">{METHOD_LABEL[expense.split_method]}</DetailRow>
      </dl>

      <h3 className="mb-1 mt-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">Who owes what</h3>
      <ul className="divide-y divide-line">
        {expense.splits.map((split) => {
          const note = splitNote(expense.split_method, split);
          return (
            <li key={split.user_id} className="flex items-center gap-3 py-2.5">
              <Avatar name={split.name} size={32} />
              <span className="min-w-0 flex-1 truncate text-sm">
                {split.name}
                {split.user_id === userId && <span className="text-ink-muted"> (you)</span>}
              </span>
              {note && <span className="text-xs text-ink-muted">{note}</span>}
              <span className="money text-sm font-medium">{formatInr(split.share)}</span>
            </li>
          );
        })}
      </ul>

      {canModify && (
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" className="text-owe" onClick={() => onDelete(expense)}>
            <Icon name="trash" size={18} /> Delete
          </Button>
          <Link to={`/groups/${groupId}/expenses/${expense.id}/edit`} className={buttonClass('secondary')}>
            <Icon name="pencil" size={18} /> Edit
          </Link>
        </div>
      )}
    </Modal>
  );
}

export default function ExpensesTab({ group }) {
  const { user } = useAuth();
  const toast = useToast();
  const { reload: reloadGroups } = useGroups();

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get(`/groups/${group.id}/expenses?limit=${PAGE_SIZE}&offset=0`)
      .then((data) => {
        if (cancelled) return;
        setItems(data.expenses);
        setTotal(data.total);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        setStatus('error');
      });
    return () => { cancelled = true; };
  }, [group.id, attempt]);

  function retry() {
    setStatus('loading');
    setAttempt((n) => n + 1);
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const data = await api.get(`/groups/${group.id}/expenses?limit=${PAGE_SIZE}&offset=${items.length}`);
      setItems((list) => [...list, ...data.expenses]);
      setTotal(data.total);
    } catch (err) {
      toast.error(err.message);
    }
    setLoadingMore(false);
  }

  async function confirmDelete() {
    await api.del(`/expenses/${toDelete.id}`);
    setItems((list) => list.filter((e) => e.id !== toDelete.id));
    setTotal((n) => n - 1);
    setToDelete(null);
    toast.success('Expense deleted');
    reloadGroups(); // balances changed, so the sidebar chips and dashboard totals must refresh
  }

  if (status === 'loading') {
    return (
      <div aria-hidden="true" className="space-y-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-card bg-sunken" />)}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <Alert kind="error">
        <p>{error.message}</p>
        <button type="button" onClick={retry} className="mt-1 font-medium underline">Try again</button>
      </Alert>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon="receipt"
        title="No expenses yet"
        action={
          <Link to={`/groups/${group.id}/expenses/new`} className={buttonClass('primary')}>
            <Icon name="plus" size={18} /> Add the first expense
          </Link>
        }
      >
        Record who paid for what and how it is shared, and balances are worked out for you.
      </EmptyState>
    );
  }

  return (
    <div>
      <div className="space-y-6">
        {groupByDate(items).map((day) => (
          <section key={day.date} aria-label={dateHeading(day.date)}>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-muted">
              <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
              {dateHeading(day.date)}
            </h2>
            <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-soft">
              {day.items.map((expense) => (
                <ExpenseRow key={expense.id} expense={expense} userId={user.id} onOpen={setSelected} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {items.length < total && (
        <div className="mt-6 text-center">
          <p className="mb-2 text-sm text-ink-muted">Showing {items.length} of {total}</p>
          <Button variant="secondary" onClick={loadMore} loading={loadingMore}>Load more</Button>
        </div>
      )}

      {selected && (
        <ExpenseDetails
          expense={selected}
          userId={user.id}
          groupId={group.id}
          canModify={selected.created_by === user.id || group.my_role === 'admin'}
          onClose={() => setSelected(null)}
          onDelete={(expense) => { setSelected(null); setToDelete(expense); }}
        />
      )}

      {toDelete && (
        <ConfirmDialog
          title="Delete this expense?"
          message={`"${toDelete.description}" (${formatInr(toDelete.amount)}) will be removed and everyone's balances will be recalculated. This cannot be undone.`}
          confirmLabel="Delete expense"
          onConfirm={confirmDelete}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  );
}