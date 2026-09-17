import { useCallback, useState } from 'react';
import { STORAGE_PREFIX } from '../utils/constants';

/**
 * One choice out of a known few, remembered across sessions.
 *
 * The sibling of usePersistentFlag, which only ever held true or false. Same
 * rules: a value that is not one of the allowed ones is treated as absent
 * rather than trusted, and every storage failure is swallowed — private
 * browsing and a full quota both throw, and neither is a reason to take the
 * screen down. The choice then simply lasts for this session.
 */
export function usePersistentChoice<T extends string>(
  name: string,
  allowed: readonly T[],
  fallback: T
): [T, (value: T) => void] {
  const key = `${STORAGE_PREFIX}${name}`;

  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved !== null && (allowed as readonly string[]).includes(saved) ? (saved as T) : fallback;
    } catch {
      return fallback;
    }
  });

  const set = useCallback(
    (next: T) => {
      if (!(allowed as readonly string[]).includes(next)) return;
      setValue(next);
      try {
        localStorage.setItem(key, next);
      } catch {
        // Kept in memory for this session; nothing else is affected.
      }
    },
    // `allowed` is a literal list at every call site; re-running on a new array
    // identity would throw away nothing but would churn the callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  );

  return [value, set];
}
