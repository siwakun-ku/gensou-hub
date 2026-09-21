/**
 * The standard page width. The layout's <main> is deliberately unconstrained so
 * a page can render something full-bleed (the hero) before wrapping the rest of
 * its content in this.
 */
export default function Container({ className = '', children }) {
  return <div className={`mx-auto max-w-5xl px-4 py-8 ${className}`}>{children}</div>;
}
