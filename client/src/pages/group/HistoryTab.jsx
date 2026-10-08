import { useEffect, useState } from 'react';
import { api } from '../../api';
import Alert from '../../components/Alert';
import Button from '../../components/Button';
import EmptyState from '../../components/EmptyState';
import Icon from '../../components/Icon';
import { useToast } from '../../context/ToastContext';
import { dateHeading, formatTime, sqliteToLocalYmd } from '../../utils/date';
import { inputClass } from '../../components/Field';

const PAGE_SIZE = 30;

const FILTERS = [
  { value: '', label: 'All activity' },
  { value: 'EXPENSE_CREATED', label: 'Expenses added' },
  { value: 'EXPENSE_EDITED', label: 'Expenses edited' },
  { value: 'EXPENSE_DELETED', label: 'Expenses deleted' },
  { value: 'SETTLEMENT_RECORDED', label: 'Payments recorded' },
  { value: 'MEMBER_ADDED', label: 'Members added' },
  { value: 'MEMBER_REMOVED', label: 'Members removed' },
];

function iconFor(action) {
  if (action.startsWith('EXPENSE_')) return 'receipt';
  if (action.startsWith('SETTLEMENT_')) return 'wallet';
  if (action.startsWith('MEMBER_') || action === 'GROUP_CREATED') return 'users';
  if (action === 'STATEMENT_EXPORTED') return 'download';
  return 'clock';
}

// Newest first, so entries from the same local day are next to each other.
function groupByDay(entries) {
  const days = [];
  for (const entry of entries) {
    const ymd = sqliteToLocalYmd(entry.created_at);
    const last = days[days.length - 1];
    if (last && last.ymd === ymd) last.items.push(entry);
    else days.push({ ymd, items: [entry] });
  }
  return days;
}

export default function HistoryTab({ group }) {
  const toast = useToast();
  const [filter, setFilter] = useState('');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const query = (offset) =>
    `/groups/${group.id}/history?limit=${PAGE_SIZE}&offset=${offset}${filter ? `&action=${filter}` : ''}`;

  useEffect(() => {
    let cancelled = false;
    api.get(`/groups/${group.id}/history?limit=${PAGE_SIZE}&offset=0${filter ? `&action=${filter}` : ''}`)
      .then((data) => {
        if (cancelled) return;
        setItems(data.history);
        setTotal(data.total);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        setStatus('error');
      });
    return () => { cancelled = true; };
  }, [group.id, filter, attempt]);

  function changeFilter(value) {
    setStatus('loading');
    setFilter(value);
  }

  function retry() {
    setStatus('loading');
    setAttempt((n) => n + 1);
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const data = await api.get(query(items.length));
      setItems((list) => [...list, ...data.history]);
      setTotal(data.total);
    } catch (err) {
      toast.error(err.message);
    }
    setLoadingMore(false);
  }

  return (
    <div>
      <label htmlFor="history-filter" className="sr-only">Filter activity</label>
      <select id="history-filter" className={`${inputClass} sm:max-w-xs`} value={filter} onChange={(e) => changeFilter(e.target.value)}>
        {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>

      <div className="mt-5">
        {status === 'loading' && (
          <div aria-hidden="true" className="space-y-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-card bg-sunken" />)}
          </div>
        )}

        {status === 'error' && (
          <Alert kind="error">
            <p>{error.message}</p>
            <button type="button" onClick={retry} className="mt-1 font-medium underline">Try again</button>
          </Alert>
        )}

        {status === 'ready' && items.length === 0 && (
          <EmptyState icon="clock" title="No activity found">
            {filter ? 'Nothing matches this filter yet.' : 'Everything that happens in this group will be listed here.'}
          </EmptyState>
        )}

        {status === 'ready' && items.length > 0 && (
          <>
            <div className="space-y-6">
              {groupByDay(items).map((day) => (
                <section key={day.ymd} aria-label={dateHeading(day.ymd)}>
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-muted">
                    <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
                    {dateHeading(day.ymd)}
                  </h2>
                  <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-soft">
                    {day.items.map((entry) => (
                      <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-sunken text-ink-muted">
                          <Icon name={iconFor(entry.action)} size={18} />
                        </span>
                        <p className="min-w-0 flex-1 break-words text-sm">{entry.description}</p>
                        <time className="shrink-0 text-xs text-ink-muted">{formatTime(entry.created_at)}</time>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            {items.length < total && (
              <div className="mt-6 text-center">
                <p className="mb-2 text-sm text-ink-muted">Showing {items.length} of {total}</p>
                <Button variant="secondary" onClick={loadMore} loading={loadingMore}>Load more</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}