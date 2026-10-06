import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="anim-rise py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-ink-muted">This page does not exist, or has not been built yet.</p>
      <Link to="/" className="mt-6 inline-flex min-h-11 items-center rounded-field bg-primary px-4 text-sm font-medium text-on-primary hover:bg-primary-hover">
        Back to dashboard
      </Link>
    </div>
  );
}