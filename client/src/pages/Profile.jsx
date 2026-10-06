import { useState } from 'react';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import Icon from '../components/Icon';
import ThemeToggle from '../components/ThemeToggle';
import { useAuth } from '../context/AuthContext';
import { useGroups } from '../context/GroupsContext';
import { formatDate } from '../utils/date';

function Row({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-medium">{children}</dd>
    </div>
  );
}

export default function Profile() {
  const { user, logout } = useAuth();
  const { groups, loading } = useGroups();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await logout(); // ProtectedRoute then redirects to /login
  }

  return (
    <div className="anim-rise mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>

      <div className="mt-6 rounded-card border border-line bg-surface p-5 shadow-soft">
        <div className="flex items-center gap-4">
          <Avatar name={user.name} size={64} />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{user.name}</p>
            <p className="truncate text-ink-muted">{user.email}</p>
          </div>
        </div>

        <dl className="mt-4 divide-y divide-line border-t border-line">
          <Row label="Member since">{formatDate(user.created_at)}</Row>
          <Row label="Groups">{loading ? '...' : groups.length}</Row>
        </dl>
      </div>

      <div className="mt-4 rounded-card border border-line bg-surface p-5 shadow-soft">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">Appearance</h2>
        <ThemeToggle />
      </div>

      <Button variant="secondary" className="mt-4 w-full" onClick={handleLogout} loading={loggingOut}>
        <Icon name="logout" size={18} /> Log out
      </Button>
    </div>
  );
}