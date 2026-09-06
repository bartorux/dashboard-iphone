import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnlineStatus } from '../useOnlineStatus';

function setOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value,
  });
}

describe('useOnlineStatus', () => {
  afterEach(() => {
    setOnLine(true);
  });

  it('reads its initial value from navigator.onLine', () => {
    setOnLine(false);
    const { result } = renderHook(() => useOnlineStatus());

    expect(result.current).toBe(false);
  });

  it('flips to false on a window "offline" event', () => {
    setOnLine(true);
    const { result } = renderHook(() => useOnlineStatus());

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current).toBe(false);
  });

  it('flips back to true on a window "online" event', () => {
    setOnLine(false);
    const { result } = renderHook(() => useOnlineStatus());

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current).toBe(true);
  });

  it('removes its online/offline listeners on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useOnlineStatus());
    const addedTypes = addSpy.mock.calls
      .map(([type]) => type)
      .filter((type) => type === 'online' || type === 'offline')
      .sort();

    unmount();

    const removedTypes = removeSpy.mock.calls
      .map(([type]) => type)
      .filter((type) => type === 'online' || type === 'offline')
      .sort();

    expect(addedTypes).toEqual(['offline', 'online']);
    expect(removedTypes).toEqual(['offline', 'online']);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
