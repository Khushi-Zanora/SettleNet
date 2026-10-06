import { Link } from 'react-router-dom';
import Alert from '../components/Alert';
import BalanceChip from '../components/BalanceChip';
import { buttonClass } from '../components/Button';
import EmptyState from '../components/EmptyState';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { useGroups } from '../context/GroupsContext';
import { formatInr } from '../utils/money';

// Full class names are written out so Tailwind can see them.
const TONES = {
  gain: { box: 'bg-gain-soft text-gain', icon: 'arrowIn' },
  owe: { box: 'bg-owe-soft text-owe', icon: 'arrowOut' },
};

function SummaryTile({ label, amount, tone }) {
  const { box, icon } = TONES[tone];
  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-soft">
      <div className="flex items-center gap-3">
        <span className={`flex size-9 items-center justify-center rounded-full ${box}`}>
          <Icon name={icon} size={18} />
        </span>
        <span className="text-sm text-ink-muted">{label}</span>
      </div>
      <p className="money mt-3 text-2xl font-semibold tracking-tight">{formatInr(amount)}</p>
      <p className="mt-0.5 text-xs text-ink-muted">across all your groups</p>
    </div>
  );
}

function GroupCard({ group }) {
  const members = `${group.member_count} member${group.member_count === 1 ? '' : 's'}`;
  return (
    <Link
      to={`/groups/${group.id}`}
      className="group block rounded-card border border-line bg-surface p-4 shadow-soft transition-colors hover:border-primary"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Icon name="users" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{group.name}</h3>
          {group.description && <p className="mt-0.5 line-clamp-2 text-sm text-ink-muted">{group.description}</p>}
        </div>
        <Icon name="chevronRight" size={18} className="mt-2.5 text-ink-muted group-hover:text-primary" />
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-sm text-ink-muted">
          {members}
          {group.my_role === 'admin' && ' \u00B7 You are admin'}
        </span>
        <BalanceChip status={group.my_status} balance={group.my_balance} />
      </div>
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-32 animate-pulse rounded-card bg-sunken" />
        <div className="h-32 animate-pulse rounded-card bg-sunken" />
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-card bg-sunken" />)}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { groups, totals, loading, error, reload } = useGroups();
  const firstName = user.name.trim().split(/\s+/)[0];

  return (
    <div className="anim-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hello, {firstName}</h1>
          <p className="mt-1 text-ink-muted">Here is where you stand in your groups.</p>
        </div>
        {groups.length > 0 && (
          <Link to="/groups/new" className={buttonClass('primary')}>
            <Icon name="plus" size={18} /> New group
          </Link>
        )}
      </div>

      <div className="mt-6">
        {loading && <DashboardSkeleton />}

        {!loading && error && groups.length === 0 && (
          <Alert kind="error">
            <p>{error.message}</p>
            <button type="button" onClick={reload} className="mt-1 font-medium underline">Try again</button>
          </Alert>
        )}

        {!loading && !error && groups.length === 0 && (
          <EmptyState
            title="No groups yet"
            action={
              <Link to="/groups/new" className={buttonClass('primary')}>
                <Icon name="plus" size={18} /> Create your first group
              </Link>
            }
          >
            A group is a trip, a flat, or a team. Add the people, record what everyone spends, and SettleNet works out
            the fewest payments needed to settle up.
          </EmptyState>
        )}

        {groups.length > 0 && (
          <>
            {totals && (
              <div className="grid gap-3 sm:grid-cols-2">
                <SummaryTile label="You are owed" amount={totals.total_owed} tone="gain" />
                <SummaryTile label="You owe" amount={totals.total_owe} tone="owe" />
              </div>
            )}

            <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-ink-muted">Your groups</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {groups.map((group) => <GroupCard key={group.id} group={group} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}