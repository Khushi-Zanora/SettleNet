import { useAuth } from '../context/AuthContext';

export default function DashboardStub() {
  const { user } = useAuth();
  return (
    <div className="anim-rise">
      <h1 className="text-2xl font-semibold tracking-tight">Hello, {user.name}</h1>
      <p className="mt-2 text-ink-muted">
        The dashboard is built in the next step. Your groups already appear in the sidebar, loaded from the API.
      </p>
    </div>
  );
}