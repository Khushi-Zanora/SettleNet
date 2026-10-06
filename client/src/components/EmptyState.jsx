import Icon from './Icon';

export default function EmptyState({ icon = 'users', title, children, action }) {
  return (
    <div className="rounded-card border border-dashed border-line bg-surface px-6 py-12 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon name={icon} size={24} />
      </span>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      {children && <p className="mx-auto mt-1.5 max-w-sm text-ink-muted">{children}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}