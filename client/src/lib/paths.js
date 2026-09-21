/**
 * Routes that are built from data rather than written out by hand.
 *
 * A circle is addressed by name — it is the only thing an album carries, and a
 * circle nobody has written up has no id to be addressed by — so the name has
 * to be encoded every time. Doing that in one place is what stops a circle
 * whose name contains a slash or a space from working on some pages and not
 * others.
 *
 * Kept in lib rather than beside the page so components can link to a circle
 * without importing a page module.
 */
export const circlePath = (name) => `/circles/${encodeURIComponent(name)}`;
