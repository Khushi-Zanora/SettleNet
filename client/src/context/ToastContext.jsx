import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback((type, message) => {
    nextId.current += 1;
    const id = nextId.current;
    setToasts((list) => [...list.slice(-2), { id, type, message }]); // keep at most 3
    setTimeout(() => dismiss(id), 4500);
  }, [dismiss]);

  const toast = useMemo(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m) }),
    [push]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col gap-2 lg:inset-x-auto lg:bottom-auto lg:right-4 lg:top-4 lg:w-96"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="anim-rise pointer-events-auto flex items-start gap-3 rounded-card border border-line bg-surface p-3 shadow-soft"
          >
            <span className={t.type === 'success' ? 'text-gain' : 'text-owe'}>
              <Icon name={t.type === 'success' ? 'check' : 'alert'} size={20} />
            </span>
            <p className="flex-1 text-sm">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="-m-2 flex size-10 items-center justify-center rounded-field text-ink-muted hover:text-ink"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);