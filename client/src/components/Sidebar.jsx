import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useGroups } from '../context/GroupsContext';
import Avatar from './Avatar';
import BalanceChip from './BalanceChip';
import Brand from './Brand';
import Button from './Button';
import Icon from './Icon';
import ThemeToggle from './ThemeToggle';

const linkClass = ({ isActive }) =>
  `flex min-h-11 items-center gap-3 rounded-field px-3 text-sm transition-colors ${
    isActive ? 'bg-primary-soft font-medium text-primary' : 'text-ink hover:bg-sunken'
  }`;

export default function Sidebar({ onClose }) {
  const { user, logout } = useAuth();
  const { groups, loading, error, reload } = useGroups();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await logout(); // ProtectedRoute then redirects to /login
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <Link to="/" aria-label="SettleNet home"><Brand /></Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="-mr-2 flex size-11 items-center justify-center rounded-field text-ink-muted hover:bg-sunken"
          >
            <Icon name="close" />
          </button>
        )}
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-3">
        <NavLink to="/" end className={linkClass}>
          <Icon name="home" size={18} /> Dashboard
        </NavLink>

        <h2 className="mb-1.5 mt-5 px-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Your groups</h2>

        {loading && (
          <div className="space-y-2" aria-hidden="true">
            {[0, 1, 2].map((i) => <div key={i} className="h-11 animate-pulse rounded-field bg-sunken" />)}
          </div>
        )}

        {error && groups.length === 0 && (
          <div className="px-3 py-2 text-sm text-owe">
            <p>Could not load your groups.</p>
            <button type="button" onClick={reload} className="mt-1 font-medium underline">Try again</button>
          </div>
        )}

        {!loading && !error && groups.length === 0 && (
          <p className="px-3 py-2 text-sm text-ink-muted">No groups yet.</p>
        )}

        <ul className="space-y-0.5">
          {groups.map((group) => (
            <li key={group.id}>
              <NavLink to={`/groups/${group.id}`} className={linkClass}>
                <Icon name="users" size={18} />
                <span className="min-w-0 flex-1 py-2">
                  <span className="block truncate">{group.name}</span>
                  <BalanceChip status={group.my_status} balance={group.my_balance} className="mt-1" />
                </span>
              </NavLink>
            </li>
          ))}
        </ul>

        <Link
          to="/groups/new"
          className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-field border border-line text-sm font-medium hover:bg-sunken"
        >
          <Icon name="plus" size={18} /> New group
        </Link>
      </nav>

      <div className="shrink-0 space-y-3 border-t border-line p-3">
        <Link to="/profile" className="flex items-center gap-3 rounded-field p-2 hover:bg-sunken">
          <Avatar name={user.name} size={40} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block truncate text-xs text-ink-muted">{user.email}</span>
          </span>
        </Link>
        <ThemeToggle />
        <Button variant="secondary" className="w-full" onClick={handleLogout} loading={loggingOut}>
          <Icon name="logout" size={18} /> Log out
        </Button>
      </div>
    </div>
  );
}