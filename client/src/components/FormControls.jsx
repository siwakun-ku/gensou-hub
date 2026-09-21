export function Field({ label, hint, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Input(props) {
  return (
    <input
      {...props}
      // An explicit ground, not an inherited one: on the sign-in pages the card
      // is translucent over a wallpaper, and a transparent field would have the
      // picture showing through whatever is being typed into it. Everywhere
      // else this is the colour the field was sitting on anyway.
      className="w-full rounded-md border border-slate-300 bg-surface px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
    />
  );
}

export function ErrorMessage({ children }) {
  if (!children) return null;
  return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p>;
}
