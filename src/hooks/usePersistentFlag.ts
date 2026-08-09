import { useCallback, useState } from 'react';
import { STORAGE_PREFIX } from '../utils/constants';

/**
 * A true/false choice that outlives the session.
 *
 * Collapsing something is a standing preference, not a gesture: held only in
 * component state it would spring back open every time the app was reopened,
 * so the person who wanted less of it would have to say so again and again.
 * That is the difference between a control that works and one that merely looks
 * like it does.
 *
 * Storage failures are swallowed on purpose — private browsing and a full quota
 * both throw, and neither is a reason to take the screen down. The choice
 * simply reverts to its default.
 */
export function usePersistentFlag(
  name: string,
  fallback: boolean
): [boolean, (value: boolean) => void] {
  const key = `${STORAGE_PREFIX}${name}`;

  const [value, setValue] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? fallback : saved === 'true';
    } catch {
      return fallback;
    }
  });

  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        localStorage.setItem(key, String(next));
      } catch {
        // Kept in memory for this session; nothing else is affected.
      }
    },
    [key]
  );

  return [value, set];
}
