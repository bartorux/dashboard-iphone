import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInstallPrompt } from '../useInstallPrompt';

const ORIGINAL_UA = window.navigator.userAgent;

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: ua,
  });
}

const IPHONE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function beforeInstallPromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

describe('useInstallPrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setUserAgent(DESKTOP_CHROME_UA);
    delete (window.navigator as { standalone?: boolean }).standalone;
  });

  afterEach(() => {
    vi.useRealTimers();
    setUserAgent(ORIGINAL_UA);
    delete (window.navigator as { standalone?: boolean }).standalone;
  });

  it('captures a "beforeinstallprompt" event, preventing the default mini-infobar', () => {
    renderHook(() => useInstallPrompt());
    const event = beforeInstallPromptEvent();

    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
  });

  it('exposes the captured prompt so installableState becomes true, and install() drives it', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    const event = beforeInstallPromptEvent('accepted');

    act(() => {
      window.dispatchEvent(event);
    });
    expect(result.current.installableState).toBe(true);

    await act(async () => {
      await result.current.install();
    });

    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(result.current.isInstalled).toBe(true);
    expect(result.current.installableState).toBe(false);
  });

  it('hides the prompt on "appinstalled"', () => {
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      window.dispatchEvent(beforeInstallPromptEvent());
    });
    expect(result.current.installableState).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(result.current.isInstalled).toBe(true);
    expect(result.current.installableState).toBe(false);
  });

  it('flags iOS Safari (no native prompt available there) as installable === "ios"', () => {
    setUserAgent(IPHONE_SAFARI_UA);
    const { result } = renderHook(() => useInstallPrompt());

    expect(result.current.installableState).toBe('ios');
  });

  it('keeps the iOS hint even after the fallback timer fires', () => {
    setUserAgent(IPHONE_SAFARI_UA);
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.installableState).toBe('ios');
  });

  it('falls back to "manual" after the timeout when no prompt was ever offered', () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.installableState).toBe(false);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.installableState).toBe('manual');
  });
});
