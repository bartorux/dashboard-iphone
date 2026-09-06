import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistentFlag } from '../usePersistentFlag';
import { STORAGE_PREFIX } from '../../utils/constants';

const key = (name: string) => `${STORAGE_PREFIX}${name}`;

describe('usePersistentFlag', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('falls back to the given default when nothing is stored', () => {
    const { result } = renderHook(() => usePersistentFlag('collapsed', false));

    expect(result.current[0]).toBe(false);
  });

  it('reads a previously stored value, overriding the default', () => {
    localStorage.setItem(key('collapsed'), 'true');
    const { result } = renderHook(() => usePersistentFlag('collapsed', false));

    expect(result.current[0]).toBe(true);
  });

  it('persists a new value to localStorage and reflects it immediately', () => {
    const { result } = renderHook(() => usePersistentFlag('collapsed', false));

    act(() => {
      result.current[1](true);
    });

    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem(key('collapsed'))).toBe('true');
  });

  it('falls back to the default, without throwing, when reading storage fails', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: private browsing');
    });

    let value: boolean | undefined;
    expect(() => {
      const { result } = renderHook(() => usePersistentFlag('collapsed', true));
      value = result.current[0];
    }).not.toThrow();

    expect(value).toBe(true);
  });

  it('keeps the new value in memory, without throwing, when writing storage fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const { result } = renderHook(() => usePersistentFlag('collapsed', false));

    expect(() => {
      act(() => {
        result.current[1](true);
      });
    }).not.toThrow();

    expect(result.current[0]).toBe(true);
  });
});
