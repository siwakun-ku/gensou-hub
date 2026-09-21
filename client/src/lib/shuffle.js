/**
 * A random permutation of a list, leaving the original untouched.
 *
 * Fisher-Yates, because the obvious `sort(() => Math.random() - 0.5)` is not a
 * shuffle: the comparator is inconsistent, so the result depends on the sort
 * algorithm and some orderings come up far more often than others.
 */
export function shuffled(items) {
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}
