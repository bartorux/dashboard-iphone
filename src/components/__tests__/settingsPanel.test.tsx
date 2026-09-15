import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import SettingsPanel, { SettingsPanelProps } from '../SettingsPanel';
import { THRESHOLD_IDLE_MS } from '../SettingsContent';
import { Settings } from '../../types';
import { version as packageVersion } from '../../../package.json';

const settings: Settings = { orangeThreshold: 500, redThreshold: 300, version: 1 };

function props(overrides: Partial<SettingsPanelProps> = {}): SettingsPanelProps {
  return {
    open: true,
    onClose: vi.fn(),
    settings,
    onSave: vi.fn(() => null),
    onReset: vi.fn(),
    theme: 'system',
    onThemeChange: vi.fn(),
    currentMargin: 970,
    installableState: 'manual',
    isInstalled: false,
    onInstall: vi.fn(() => Promise.resolve()),
    version: '9.9.9',
    ...overrides,
  };
}

const uwaga = () => screen.getByRole('textbox', { name: /Uwaga/ });
const alarm = () => screen.getByRole('textbox', { name: /Alarm/ });

/** Replaces the setup's matchMedia so the side-panel breakpoint can be crossed. */
function mockMedia(matching: string[]) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: matching.includes(query),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('SettingsPanel — sheet on a phone', () => {
  it('is a labelled modal dialog', () => {
    render(<SettingsPanel {...props()} />);

    const dialog = screen.getByRole('dialog', { name: 'Ustawienia' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('takes focus when it opens', () => {
    render(<SettingsPanel {...props()} />);

    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('renders nothing while closed', () => {
    render(<SettingsPanel {...props({ open: false })} />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('orders the sections thresholds, appearance, application', () => {
    render(<SettingsPanel {...props()} />);

    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['Progi marginesu', 'Wygląd', 'Aplikacja']);
  });

  it('describes both thresholds as margin thresholds, inclusive', () => {
    render(<SettingsPanel {...props()} />);

    expect(uwaga()).toHaveAccessibleName('Uwaga gdy margines ≤');
    expect(alarm()).toHaveAccessibleName('Alarm gdy margines ≤');
  });

  it('marks the current margin on the scale', () => {
    render(<SettingsPanel {...props({ currentMargin: 970 })} />);

    expect(screen.getByText('teraz +970')).toBeInTheDocument();
    expect(screen.getByTestId('scale-now')).toBeInTheDocument();
  });

  it('draws no marker while the margin is unknown', () => {
    render(<SettingsPanel {...props({ currentMargin: null })} />);

    expect(screen.queryByTestId('scale-now')).toBeNull();
    expect(screen.queryByText(/teraz/)).toBeNull();
  });
});

describe('SettingsPanel — theme', () => {
  it('marks the active preference and offers all three', () => {
    render(<SettingsPanel {...props({ theme: 'dark' })} />);

    expect(screen.getByRole('radio', { name: 'Ciemny' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Jasny' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Systemowy' })).not.toBeChecked();
  });

  it('reports the chosen preference', () => {
    const onThemeChange = vi.fn();
    render(<SettingsPanel {...props({ onThemeChange })} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Jasny' }));

    expect(onThemeChange).toHaveBeenCalledWith('light');
  });
});

describe('SettingsPanel — saving on its own', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  it('has no save button', () => {
    render(<SettingsPanel {...props()} />);

    expect(screen.queryByRole('button', { name: /Zapisz/ })).toBeNull();
  });

  it('saves a valid value once typing pauses', () => {
    const onSave = vi.fn(() => null);
    render(<SettingsPanel {...props({ onSave })} />);

    fireEvent.change(uwaga(), { target: { value: '650' } });
    expect(onSave).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(THRESHOLD_IDLE_MS));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ orangeThreshold: 650 });
  });

  it('does not save the numbers passed through on the way to the one meant', () => {
    // 2 and 25 are both valid Alarm thresholds; neither is what was typed.
    const onSave = vi.fn(() => null);
    render(<SettingsPanel {...props({ onSave })} />);

    fireEvent.change(alarm(), { target: { value: '2' } });
    act(() => vi.advanceTimersByTime(THRESHOLD_IDLE_MS - 100));
    fireEvent.change(alarm(), { target: { value: '25' } });
    act(() => vi.advanceTimersByTime(THRESHOLD_IDLE_MS - 100));
    fireEvent.change(alarm(), { target: { value: '250' } });
    act(() => vi.advanceTimersByTime(THRESHOLD_IDLE_MS));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ redThreshold: 250 });
  });

  it('saves at once when the field is left', () => {
    const onSave = vi.fn(() => null);
    render(<SettingsPanel {...props({ onSave })} />);

    fireEvent.change(uwaga(), { target: { value: '700' } });
    fireEvent.blur(uwaga());

    expect(onSave).toHaveBeenCalledWith({ orangeThreshold: 700 });
  });

  it('saves a valid pending value when the panel closes before the pause', () => {
    const onSave = vi.fn(() => null);
    const { rerender } = render(<SettingsPanel {...props({ onSave })} />);

    fireEvent.change(uwaga(), { target: { value: '800' } });
    rerender(<SettingsPanel {...props({ onSave, open: false })} />);

    expect(onSave).toHaveBeenCalledWith({ orangeThreshold: 800 });
  });

  it('keeps a cleared field empty instead of snapping back', () => {
    render(<SettingsPanel {...props()} />);

    fireEvent.change(uwaga(), { target: { value: '' } });

    expect(uwaga()).toHaveValue('');
  });
});

describe('SettingsPanel — error under the field', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  it('stays quiet while a value is still being typed', () => {
    render(<SettingsPanel {...props()} />);

    // 1 on the way to 1000 is below Alarm.
    fireEvent.change(uwaga(), { target: { value: '1' } });

    expect(screen.queryByText(/Musi być/)).toBeNull();
    expect(uwaga()).not.toHaveAttribute('aria-invalid');
  });

  it('shows the error under the field after a pause, and does not save', () => {
    const onSave = vi.fn(() => null);
    render(<SettingsPanel {...props({ onSave })} />);

    fireEvent.change(uwaga(), { target: { value: '250' } });
    act(() => vi.advanceTimersByTime(THRESHOLD_IDLE_MS));

    const message = screen.getByText('Musi być wyższy niż próg Alarm (300 MW)');
    expect(uwaga()).toHaveAttribute('aria-invalid', 'true');
    expect(uwaga()).toHaveAttribute('aria-describedby', message.id);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows it at once when the field is left', () => {
    render(<SettingsPanel {...props()} />);

    fireEvent.change(alarm(), { target: { value: '500' } });
    fireEvent.blur(alarm());

    expect(screen.getByText('Musi być niższy niż próg Uwaga (500 MW)')).toBeInTheDocument();
  });

  it('places the message inside the row of the field it belongs to', () => {
    render(<SettingsPanel {...props()} />);

    fireEvent.change(alarm(), { target: { value: '1600' } });
    fireEvent.blur(alarm());

    const row = alarm().closest('[data-field="red"]') as HTMLElement;
    expect(within(row).getByText('Wpisz wartość od 0 do 1500 MW')).toBeInTheDocument();
  });

  it('refuses decimals and anything that is not a whole number', () => {
    const onSave = vi.fn(() => null);
    render(<SettingsPanel {...props({ onSave })} />);

    fireEvent.change(uwaga(), { target: { value: '450.5' } });
    fireEvent.blur(uwaga());

    expect(screen.getByText('Wpisz liczbę całkowitą MW')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('clears the message the moment the value is corrected', () => {
    render(<SettingsPanel {...props()} />);

    fireEvent.change(uwaga(), { target: { value: '250' } });
    fireEvent.blur(uwaga());
    fireEvent.change(uwaga(), { target: { value: '450' } });

    expect(screen.queryByText(/Musi być/)).toBeNull();
  });
});

describe('SettingsPanel — steppers', () => {
  it('saves at once, on the 50 MW grid', () => {
    const onSave = vi.fn(() => null);
    render(<SettingsPanel {...props({ onSave, settings: { ...settings, orangeThreshold: 437 } })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Podnieś próg Uwaga o 50 MW' }));

    expect(onSave).toHaveBeenCalledWith({ orangeThreshold: 450 });
  });

  it('will not step Alarm up to Uwaga', () => {
    render(<SettingsPanel {...props({ settings: { ...settings, orangeThreshold: 500, redThreshold: 450 } })} />);

    expect(screen.getByRole('button', { name: 'Podnieś próg Alarm o 50 MW' })).toBeDisabled();
  });

  it('will not step Alarm below zero', () => {
    render(<SettingsPanel {...props({ settings: { ...settings, redThreshold: 0 } })} />);

    expect(screen.getByRole('button', { name: 'Obniż próg Alarm o 50 MW' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Podnieś próg Alarm o 50 MW' })).toBeEnabled();
  });
});

describe('SettingsPanel — defaults', () => {
  it('names the values it restores', () => {
    const onReset = vi.fn();
    render(
      <SettingsPanel {...props({ onReset, settings: { ...settings, orangeThreshold: 800 } })} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Przywróć progi 500 i 300 MW' }));

    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('is unavailable when the thresholds already are the defaults', () => {
    render(<SettingsPanel {...props()} />);

    expect(screen.getByRole('button', { name: /Przywróć progi/ })).toBeDisabled();
  });

  it('puts the restored values into the fields, replacing an unsaved draft', () => {
    function Harness() {
      const [current, setCurrent] = useState<Settings>({ ...settings, orangeThreshold: 800 });
      return (
        <SettingsPanel
          {...props({
            settings: current,
            onReset: () => setCurrent({ ...settings }),
          })}
        />
      );
    }
    render(<Harness />);

    fireEvent.change(alarm(), { target: { value: '9999' } });
    fireEvent.blur(alarm());
    fireEvent.click(screen.getByRole('button', { name: /Przywróć progi/ }));

    expect(uwaga()).toHaveValue('500');
    expect(alarm()).toHaveValue('300');
    expect(screen.queryByText(/Wpisz wartość/)).toBeNull();
  });
});

describe('SettingsPanel — application', () => {
  it('shows the version it is given', () => {
    render(<SettingsPanel {...props({ version: packageVersion })} />);

    const row = screen.getByText('Wersja').parentElement as HTMLElement;
    expect(within(row).getByText(packageVersion)).toBeInTheDocument();
  });

  it('explains adding to the home screen in place, where there is no install prompt', () => {
    render(<SettingsPanel {...props({ installableState: 'ios' })} />);

    const toggle = screen.getByRole('button', { name: 'Jak dodać do ekranu głównego' });
    expect(screen.getByText(/stuknij Udostępnij/)).not.toBeVisible();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/stuknij Udostępnij/)).toBeVisible();
  });

  it('installs directly when the browser offers it', () => {
    const onInstall = vi.fn(() => Promise.resolve());
    render(<SettingsPanel {...props({ installableState: true, onInstall })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dodaj do ekranu głównego' }));

    expect(onInstall).toHaveBeenCalledTimes(1);
  });

  it('says nothing about installing once installed', () => {
    render(<SettingsPanel {...props({ installableState: true, isInstalled: true })} />);

    expect(screen.queryByRole('button', { name: /ekranu głównego/ })).toBeNull();
  });

  it('keeps the install offer off a monitor', () => {
    render(<SettingsPanel {...props({ installableState: 'manual' })} />);

    const toggle = screen.getByRole('button', { name: 'Jak dodać do ekranu głównego' });
    expect(toggle.parentElement?.className).toContain('xl:hidden');
  });
});

describe('SettingsPanel — closing', () => {
  it('closes on Gotowe', () => {
    const onClose = vi.fn();
    render(<SettingsPanel {...props({ onClose })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Gotowe' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<SettingsPanel {...props({ onClose })} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a tap on the dim', () => {
    const onClose = vi.fn();
    render(<SettingsPanel {...props({ onClose })} />);

    fireEvent.click(document.querySelector('.settings-scrim') as Element);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('leaves the page once the way out has finished', async () => {
    const { rerender } = render(<SettingsPanel {...props()} />);

    rerender(<SettingsPanel {...props({ open: false })} />);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('gives focus back to the gear', () => {
    render(<button type="button" aria-label="Ustawienia" />);
    const gear = screen.getByRole('button', { name: 'Ustawienia' });
    gear.focus();

    const panel = render(<SettingsPanel {...props({ open: true })} />);
    expect(screen.getByRole('dialog')).toHaveFocus();

    panel.rerender(<SettingsPanel {...props({ open: false })} />);

    expect(gear).toHaveFocus();
  });

  it('finds the gear by name when the click did not focus it, as in Safari', () => {
    render(<button type="button" aria-label="Ustawienia" />);
    const gear = screen.getByRole('button', { name: 'Ustawienia' });
    (document.activeElement as HTMLElement | null)?.blur();

    const panel = render(<SettingsPanel {...props({ open: true })} />);
    panel.rerender(<SettingsPanel {...props({ open: false })} />);

    expect(gear).toHaveFocus();
  });

  it('keeps Tab inside the sheet', () => {
    render(<SettingsPanel {...props()} />);
    const dialog = screen.getByRole('dialog');
    const done = screen.getByRole('button', { name: 'Gotowe' });

    done.focus();
    fireEvent.keyDown(done, { key: 'Tab', shiftKey: true });

    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(done);

    fireEvent.keyDown(document.activeElement as Element, { key: 'Tab' });
    expect(done).toHaveFocus();
  });
});

describe('SettingsPanel — drag down to dismiss', () => {
  const restoreHeight = () => {
    delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight;
  };
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 700 });
  });
  afterEach(restoreHeight);

  const handle = () => document.querySelector('.settings-sheet-handle') as Element;
  /** The sheet rises over a few frames; a drag begun earlier starts from wherever it has got to. */
  const risen = () =>
    waitFor(() => expect(screen.getByRole('dialog').style.transform).toBe('translate3d(0, 0px, 0)'));
  /** jsdom stamps events with its own clock and ignores a timeStamp passed in, so it is set after creation. */
  const send = (type: 'pointerDown' | 'pointerMove' | 'pointerUp', clientY: number, t: number, pointerType: string) => {
    const event = createEvent[type](handle(), { pointerId: 1, pointerType, clientY });
    Object.defineProperty(event, 'timeStamp', { value: t });
    // jsdom's MouseEvent init drops pointer fields it does not model.
    Object.defineProperty(event, 'pointerId', { value: 1 });
    Object.defineProperty(event, 'pointerType', { value: pointerType });
    Object.defineProperty(event, 'clientY', { value: clientY });
    fireEvent(handle(), event);
  };
  const drag = (to: number, pointerType = 'touch', msPerStep = 40) => {
    let t = 1000;
    send('pointerDown', 20, t, pointerType);
    for (let i = 1; i <= 10; i++) {
      t += msPerStep;
      send('pointerMove', 20 + ((to - 20) * i) / 10, t, pointerType);
    }
    t += msPerStep;
    send('pointerUp', to, t, pointerType);
  };

  it('dismisses after a long drag', async () => {
    const onClose = vi.fn();
    render(<SettingsPanel {...props({ onClose })} />);
    await risen();

    drag(600);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('springs back after a short, slow one', async () => {
    const onClose = vi.fn();
    render(<SettingsPanel {...props({ onClose })} />);
    await risen();

    drag(80, 'touch', 200);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves a mouse alone, which has Gotowe and Escape', async () => {
    const onClose = vi.fn();
    render(<SettingsPanel {...props({ onClose })} />);
    await risen();

    drag(600, 'mouse');

    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the dashboard gestures out of a touch on the sheet', () => {
    const onDocumentTouch = vi.fn();
    document.addEventListener('touchstart', onDocumentTouch);
    render(<SettingsPanel {...props()} />);

    fireEvent.touchStart(screen.getByRole('dialog'), { touches: [{ clientX: 10, clientY: 10 }] });
    document.removeEventListener('touchstart', onDocumentTouch);

    expect(onDocumentTouch).not.toHaveBeenCalled();
  });
});

describe('SettingsPanel — side panel from 48rem', () => {
  let restore: () => void;
  beforeEach(() => {
    restore = mockMedia(['(min-width: 48rem)']);
  });
  afterEach(() => restore());

  it('is a dialog that does not block the dashboard', () => {
    render(<SettingsPanel {...props()} />);

    const dialog = screen.getByRole('dialog', { name: 'Ustawienia' });
    expect(dialog).not.toHaveAttribute('aria-modal');
    expect(dialog.className).toContain('settings-side');
    expect(document.querySelector('.settings-scrim')).toBeNull();
  });

  it('still closes on Escape and on Gotowe', () => {
    const onClose = vi.fn();
    render(<SettingsPanel {...props({ onClose })} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Gotowe' }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
