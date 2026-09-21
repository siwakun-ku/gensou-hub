/**
 * Make user input safe to drop into a RegExp.
 *
 * Search terms are typed by people, and a stray "(" or "*" would either throw
 * or quietly turn a search into a different one.
 */
export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
