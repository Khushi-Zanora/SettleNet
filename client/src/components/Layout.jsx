import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';
import Brand from './Brand';
import Icon from './Icon';
import Sidebar from './Sidebar';

export default function Layout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer whenever the page changes.
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  // While the drawer is open: Escape closes it and the page behind does not scroll.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setDrawerOpen(false); };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-surface lg:block">
        <Sidebar />
      </aside>

      {/* Phone and tablet top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface px-2 lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          className="flex size-11 items-center justify-center rounded-field text-ink hover:bg-sunken"
        >
          <Icon name="menu" />
        </button>
        <Link to="/" aria-label="SettleNet home"><Brand /></Link>
        <Link to="/profile" aria-label="Your profile" className="flex size-11 items-center justify-center">
          <Avatar name={user.name} size={32} />
        </Link>
      </header>

      {/* Phone and tablet drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="anim-fade absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="anim-drawer absolute inset-y-0 left-0 w-72 max-w-[85%] bg-surface shadow-soft"
          >
            <Sidebar onClose={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-[960px] px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}