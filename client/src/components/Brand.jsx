import Icon from './Icon';

export default function Brand({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-on-primary">
        <Icon name="swap" size={18} />
      </span>
      <span className="text-lg font-semibold tracking-tight">SettleNet</span>
    </span>
  );
}