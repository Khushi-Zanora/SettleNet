export const inputClass =
  'block w-full min-h-11 rounded-field border border-line bg-surface px-3 text-base text-ink placeholder:text-ink-muted/70 focus:border-primary';

export default function Field({ label, id, error, hint, ...inputProps }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      <input
        id={id}
        className={`${inputClass} ${error ? 'border-owe' : ''}`}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        {...inputProps}
      />
      {error && <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-owe">{error}</p>}
      {hint && !error && <p id={`${id}-hint`} className="mt-1.5 text-sm text-ink-muted">{hint}</p>}
    </div>
  );
}