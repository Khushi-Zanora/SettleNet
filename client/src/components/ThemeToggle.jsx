import { useTheme } from '../context/ThemeContext';
import Icon from './Icon';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'Match system', icon: 'monitor' },
];

export default function ThemeToggle({ className = '' }) {
  const { mode, setMode } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className={`flex rounded-field bg-sunken p-1 ${className}`}>
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={mode === option.value}
          aria-label={option.label}
          title={option.label}
          onClick={() => setMode(option.value)}
          className={`flex h-9 flex-1 items-center justify-center rounded-lg transition-colors ${
            mode === option.value ? 'bg-surface text-primary shadow-soft' : 'text-ink-muted hover:text-ink'
          }`}
        >
          <Icon name={option.icon} size={18} />
        </button>
      ))}
    </div>
  );
}