import { useFetch } from '../../hooks/useFetch';
import Alert from '../../components/Alert';
import Avatar from '../../components/Avatar';
import BalanceChip from '../../components/BalanceChip';
import { useAuth } from '../../context/AuthContext';
import { formatInr } from '../../utils/money';

function Stat({ label, value }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-soft">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="money mt-1 text-xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

export default function BalancesTab({ group }) {
  const { user } = useAuth();
  const { data, error, loading, reload } = useFetch(`/groups/${group.id}/balances`);

  if (loading && !data) {
    return (
      <div aria-hidden="true" className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="h-20 animate-pulse rounded-card bg-sunken" />
          <div className="h-20 animate-pulse rounded-card bg-sunken" />
        </div>
        <div className="h-64 animate-pulse rounded-card bg-sunken" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <Alert kind="error">
        <p>{error.message}</p>
        <button type="button" onClick={reload} className="mt-1 font-medium underline">Try again</button>
      </Alert>
    );
  }

  const { balances, summary } = data;
  const maxAbs = Math.max(1, ...balances.map((b) => Math.abs(b.balance_minor)));
  const allSettled = balances.every((b) => b.status === 'settled');

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Total spent" value={formatInr(summary.total_spent)} />
        <Stat label="Expenses" value={summary.expense_count} />
      </div>

      {summary.expense_count === 0 ? (
        <Alert kind="info" className="mt-4">Nothing to balance yet. Add an expense to get started.</Alert>
      ) : allSettled ? (
        <Alert kind="success" className="mt-4">Everyone is settled up.</Alert>
      ) : null}

      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-soft">
        {balances.map((b) => {
          const width = Math.max(4, Math.round((Math.abs(b.balance_minor) * 100) / maxAbs));
          return (
            <li key={b.user_id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar name={b.name} size={40} />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {b.name}
                  {b.user_id === user.id && <span className="font-normal text-ink-muted"> (you)</span>}
                  {!b.is_active && <span className="font-normal text-ink-muted"> (left the group)</span>}
                </span>
                <BalanceChip status={b.status} balance={b.balance} />
              </div>
              {b.status !== 'settled' && (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
                  <div
                    className={`h-full rounded-full ${b.status === 'owes' ? 'bg-owe' : 'bg-gain'}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}