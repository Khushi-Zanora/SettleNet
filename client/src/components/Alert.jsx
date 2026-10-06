import Icon from './Icon';

const KINDS = {
  error: { box: 'bg-owe-soft text-owe', icon: 'alert' },
  info: { box: 'bg-primary-soft text-primary', icon: 'info' },
  success: { box: 'bg-gain-soft text-gain', icon: 'check' },
};

export default function Alert({ kind = 'info', children, className = '' }) {
  const { box, icon } = KINDS[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-card p-3 text-sm ${box} ${className}`}>
      <Icon name={icon} size={18} className="mt-0.5" />
      <div className="flex-1">{children}</div>
    </div>
  );
}