import { formatInr } from '../utils/money';

export default function BalanceChip({ status, balance, className = '' }) {
  const base = `money inline-block rounded-full px-2 py-0.5 text-xs font-medium ${className}`;
  if (status === 'settled') return <span className={`${base} bg-sunken text-ink-muted`}>Settled</span>;

  const amount = formatInr(String(balance).replace('-', ''));
  if (status === 'owes') return <span className={`${base} bg-owe-soft text-owe`}>Owes {amount}</span>;
  return <span className={`${base} bg-gain-soft text-gain`}>Gets back {amount}</span>;
}