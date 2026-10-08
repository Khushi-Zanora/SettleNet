import { Link, useParams, useSearchParams } from 'react-router-dom';
import Alert from '../components/Alert';
import { buttonClass } from '../components/Button';
import Icon from '../components/Icon';
import Tabs from '../components/Tabs';
import { useGroups } from '../context/GroupsContext';
import { useFetch } from '../hooks/useFetch';
import BalancesTab from './group/BalancesTab';
import ExpensesTab from './group/ExpensesTab';
import HistoryTab from './group/HistoryTab';
import MembersTab from './group/MembersTab';
import SettleTab from './group/SettleTab';

const TABS = [
  { id: 'expenses', label: 'Expenses', icon: 'receipt' },
  { id: 'balances', label: 'Balances', icon: 'chart' },
  { id: 'settle', label: 'Settle up', icon: 'wallet' },
  { id: 'history', label: 'History', icon: 'clock' },
  { id: 'members', label: 'Members', icon: 'users' },
];

function GroupSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-4">
      <div className="h-8 w-1/2 animate-pulse rounded-field bg-sunken" />
      <div className="h-11 animate-pulse rounded-field bg-sunken" />
      <div className="h-64 animate-pulse rounded-card bg-sunken" />
    </div>
  );
}

function GroupView({ id }) {
  const { data, error, loading, reload } = useFetch(`/groups/${id}`);
  const { reload: reloadGroups } = useGroups();
  const [params, setParams] = useSearchParams();

  const requested = params.get('tab');
  const tab = TABS.some((t) => t.id === requested) ? requested : 'expenses';

  // After members change: refresh this page and the sidebar/dashboard member counts.
  const onChanged = () => {
    reload();
    reloadGroups();
  };

  if (loading && !data) return <GroupSkeleton />;

  if (error && !data) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Alert kind="error">
          <p>{error.message}</p>
          <Link to="/" className="mt-1 inline-block font-medium underline">Back to dashboard</Link>
        </Alert>
      </div>
    );
  }

  const group = data.group;
  const memberText = `${group.members.length} member${group.members.length === 1 ? '' : 's'}`;

  return (
    <div className="anim-rise">
      <Link to="/" className="inline-flex min-h-8 items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <Icon name="arrowLeft" size={16} /> Dashboard
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold tracking-tight">{group.name}</h1>
          {group.description && <p className="mt-1 text-ink-muted">{group.description}</p>}
          <p className="mt-1 text-sm text-ink-muted">
            {memberText}
            {group.my_role === 'admin' && ' \u00B7 You are admin'}
          </p>
        </div>
        <Link to={`/groups/${group.id}/expenses/new`} className={buttonClass('primary', 'shrink-0')}>
          <Icon name="plus" size={18} /> Add expense
        </Link>
      </div>

      <div className="mt-5">
        <Tabs tabs={TABS} active={tab} onChange={(next) => setParams({ tab: next })} />
      </div>

      <div id="tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-5">
        {tab === 'expenses' && <ExpensesTab group={group} />}
        {tab === 'balances' && <BalancesTab group={group} />}
        {tab === 'settle' && <SettleTab group={group} />}
        {tab === 'history' && <HistoryTab group={group} />}
        {tab === 'members' && <MembersTab group={group} onChanged={onChanged} />}
      </div>
    </div>
  );
}

export default function Group() {
  const { id } = useParams();
  return <GroupView key={id} id={id} />;
}