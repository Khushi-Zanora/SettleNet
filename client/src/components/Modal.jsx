import { useEffect, useRef } from 'react';
import Icon from './Icon';

export default function Modal({ open = true, onClose, title, children }) {
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);

  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="anim-fade absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className="anim-rise relative flex max-h-[90dvh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-soft outline-none sm:max-w-lg sm:rounded-card"
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h2 id="modal-title" className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex size-11 items-center justify-center rounded-field text-ink-muted hover:bg-sunken"
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}