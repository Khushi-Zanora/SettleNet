import Icon from './Icon';

export default function Tabs({ tabs, active, onChange }) {
  return (
    <div role="tablist" aria-label="Group sections" className="-mx-4 flex overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls="tabpanel"
            onClick={() => onChange(tab.id)}
            className={`-mb-px flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors ${
              selected ? 'border-primary text-primary' : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            <Icon name={tab.icon} size={18} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}