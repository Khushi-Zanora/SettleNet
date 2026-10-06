const VARIANTS = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border border-line bg-surface text-ink hover:bg-sunken',
  ghost: 'text-ink hover:bg-sunken',
  danger: 'bg-owe text-on-primary hover:opacity-90',
};

export default function Button({
  variant = 'primary',
  loading = false,
  disabled = false,
  type = 'button',
  className = '',
  children,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-field px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {loading && (
        <span
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}