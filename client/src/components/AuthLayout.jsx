import Brand from './Brand';
import ThemeToggle from './ThemeToggle';

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <ThemeToggle className="absolute right-3 top-3 w-36" />
      <div className="anim-rise w-full max-w-sm">
        <Brand className="mb-8" />
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1.5 text-ink-muted">{subtitle}</p>
        <div className="mt-6 rounded-card border border-line bg-surface p-5 shadow-soft">{children}</div>
        <p className="mt-5 text-center text-sm text-ink-muted">{footer}</p>
      </div>
    </div>
  );
}