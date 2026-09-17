import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { InstallableState, Settings } from '../types';
import type { CardId, ChartSize, Layout as LayoutState } from '../utils/layout';
import { ThemePreference } from '../hooks/useTheme';
import SegmentedControl from './SegmentedControl';
import { Group, SectionFooter, SectionHeader } from './settings/primitives';
import LayoutSection from './settings/LayoutSection';
import { ChevronDownIcon } from './icons';
import { DEFAULT_ORANGE_THRESHOLD, DEFAULT_RED_THRESHOLD } from '../utils/constants';
import { formatMW } from '../utils/format';
import {
  parseThreshold,
  stepThreshold,
  ThresholdField,
} from '../utils/thresholdInput';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Systemowy' },
  { value: 'light', label: 'Jasny' },
  { value: 'dark', label: 'Ciemny' },
];

/**
 * How long a typed value sits before it is saved, or before it is told it is
 * wrong.
 *
 * Both wait for the same pause. Saving on every valid keystroke looked simpler
 * and was wrong in practice: typing 250 into Alarm passes through 2 and 25, both
 * perfectly valid thresholds, and the chart and alerts would repaint for each.
 * Showing the error at once was wrong the other way: 1 on the way to 1000 would
 * flash "must be higher than Alarm" under a field the reader has not finished
 * with. Leaving the field or pressing Enter skips the wait.
 */
export const THRESHOLD_IDLE_MS = 700;

/** The stepper's grid. Thresholds are read in round figures. */
const STEP_MW = 50;

export interface SettingsContentProps {
  settings: Settings;
  onSave: (settings: Partial<Settings>) => string | null;
  onReset: () => void;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  /** Reserve minus required for the current hour; null while unknown. */
  currentMargin: number | null;
  installableState: InstallableState;
  isInstalled: boolean;
  onInstall: () => Promise<void>;
  version: string;
  /** Desktop layout: which cards are shown and how tall the chart is. */
  layout: LayoutState;
  onToggleCard: (id: CardId) => void;
  onChartChange: (chart: ChartSize) => void;
  onLayoutReset: () => void;
  /**
   * False from the moment the panel starts closing. A field left mid-edit is
   * then saved if valid and quietly dropped if not — an error appearing on a
   * sheet already on its way out would be read by nobody.
   */
  active: boolean;
}

/* ------------------------------------------------------------------ layout */

/* -------------------------------------------------------------- thresholds */

interface ThresholdRowProps {
  field: ThresholdField;
  label: string;
  /** Status colour of the dot, matching what the threshold paints. */
  dotClass: string;
  saved: number;
  /** The other threshold's saved value, which this one must stay on the right side of. */
  other: number;
  onCommit: (field: ThresholdField, value: number) => string | null;
  active: boolean;
}

const ThresholdRow: React.FC<ThresholdRowProps> = ({
  field,
  label,
  dotClass,
  saved,
  other,
  onCommit,
  active,
}) => {
  const inputId = useId();
  const errorId = useId();
  // Kept as a string so a cleared field stays cleared instead of snapping back
  // to the saved value on every keystroke.
  const [draft, setDraft] = useState(String(saved));
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const activeRef = useRef(active);
  activeRef.current = active;

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  /** Save if valid; otherwise say why, unless the panel is already closing. */
  const commit = useCallback(
    (text: string) => {
      clearTimer();
      const parsed = parseThreshold(field, text, other);
      if (parsed.error !== null) {
        if (activeRef.current) setError(parsed.error);
        return;
      }
      setError(null);
      if (parsed.value !== saved) {
        const refused = onCommit(field, parsed.value);
        if (refused && activeRef.current) setError(refused);
      }
    },
    [field, other, saved, onCommit]
  );
  const commitRef = useRef(commit);
  commitRef.current = commit;

  // A value changed from outside — "Przywróć" — replaces whatever is in the
  // field. The field's own saves come back through here too, and are left alone
  // because they already match.
  useEffect(() => {
    if (Number(draftRef.current.trim()) !== saved || draftRef.current.trim() === '') {
      clearTimer();
      setDraft(String(saved));
      setError(null);
    }
  }, [saved]);

  // The other threshold moved, so an error that named it may no longer hold —
  // 450 under Uwaga stops being wrong the moment Alarm drops to 400.
  const errorShown = error !== null;
  useEffect(() => {
    if (errorShown) commitRef.current(draftRef.current);
  }, [other, errorShown]);

  // Closing saves a valid pending value and drops an invalid one.
  useEffect(() => {
    if (active || timerRef.current === null) return;
    commitRef.current(draftRef.current);
  }, [active]);

  useEffect(() => () => {
    // Unmounting mid-wait still saves what was valid. Read through the ref: the
    // closure from the first render would compare against a stale saved value.
    if (timerRef.current !== null) commitRef.current(draftRef.current);
    clearTimer();
  }, []);

  const handleChange = (text: string) => {
    setDraft(text);
    clearTimer();
    // A correction clears the message straight away — making someone wait to
    // learn they fixed it would be the same lag the delay exists to avoid.
    if (parseThreshold(field, text, other).error === null) setError(null);
    timerRef.current = setTimeout(() => commitRef.current(draftRef.current), THRESHOLD_IDLE_MS);
  };

  const parsedDraft = parseThreshold(field, draft, other);
  const base = parsedDraft.value ?? saved;
  const stepTarget = (direction: 1 | -1) => {
    const next = stepThreshold(base, direction, STEP_MW);
    return parseThreshold(field, String(next), other).value;
  };
  const down = stepTarget(-1);
  const up = stepTarget(1);

  const step = (value: number | null) => {
    if (value === null) return;
    clearTimer();
    setDraft(String(value));
    setError(null);
    const refused = onCommit(field, value);
    if (refused) setError(refused);
  };

  return (
    <div className="px-4 py-2" data-field={field}>
      <div className="flex min-h-11 items-center gap-2.5">
        <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />
        <label htmlFor={inputId} className="min-w-0 flex-1 leading-tight">
          <span className="block text-[1.0625rem] text-text">{label}</span>{' '}
          <span className="block text-[0.75rem] text-text-tertiary">gdy margines ≤</span>
        </label>
        <span
          className={`flex items-baseline rounded-lg bg-sheet-field px-2 py-1 ${
            error ? 'outline outline-2 -outline-offset-2 outline-alarm' : ''
          }`}
        >
          <input
            id={inputId}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            enterKeyHint="done"
            value={draft}
            onChange={(event) => handleChange(event.target.value)}
            onBlur={() => commit(draftRef.current)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit(draftRef.current);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            // 16px floor: iOS Safari zooms the page into any field set smaller,
            // and a reader with a small text size would get that on every tap.
            className="tnum w-[4.5ch] bg-transparent text-right text-[max(1.0625rem,16px)] text-text outline-none"
          />
          <span className="ml-1 text-[0.8125rem] text-text-tertiary">MW</span>
        </span>
        <span className="flex overflow-hidden rounded-lg bg-sheet-field">
          <button
            type="button"
            onClick={() => step(down)}
            disabled={down === null}
            aria-label={`Obniż próg ${label} o ${STEP_MW} MW`}
            className="grid h-9 w-9 place-items-center text-[1.25rem] leading-none text-text active:bg-surface-3 disabled:text-text-tertiary disabled:opacity-50"
          >
            −
          </button>
          <span aria-hidden className="my-2 w-px bg-separator" />
          <button
            type="button"
            onClick={() => step(up)}
            disabled={up === null}
            aria-label={`Podnieś próg ${label} o ${STEP_MW} MW`}
            className="grid h-9 w-9 place-items-center text-[1.25rem] leading-none text-text active:bg-surface-3 disabled:text-text-tertiary disabled:opacity-50"
          >
            +
          </button>
        </span>
      </div>
      <p
        id={errorId}
        aria-live="polite"
        // Always in the tree, empty when there is nothing to say: a live region
        // that appears together with its text is not reliably announced.
        className="pl-5 text-[0.8125rem] leading-snug text-alarm-text"
      >
        {error ?? ''}
      </p>
    </div>
  );
};

/* ------------------------------------------------------------------- scale */

/** Tick labels closer than this to "teraz" are dropped rather than printed over it. */
const LABEL_CLEARANCE = 0.13;

/**
 * The two thresholds and the current margin on one axis.
 *
 * The fields say what the thresholds are; this says what they mean right now —
 * how far the hour on screen is from either of them. The axis starts at zero,
 * where Alarm cannot go below, and runs to 2.4 times Uwaga (1200 MW for the
 * defaults) so both bands keep a readable width whatever they are set to. A
 * margin beyond either end is pinned to that end, still labelled with its real
 * value.
 */
export const ThresholdScale: React.FC<{ orange: number; red: number; margin: number | null }> = ({
  orange,
  red,
  margin,
}) => {
  const max = Math.max(1200, Math.ceil((orange * 2.4) / 100) * 100);
  const at = (value: number) => Math.min(1, Math.max(0, value / max));
  const pct = (fraction: number) => `${(fraction * 100).toFixed(2)}%`;

  const redAt = at(red);
  const orangeAt = at(orange);
  const nowAt = margin === null ? null : at(margin);
  const clear = (position: number) => nowAt === null || Math.abs(position - nowAt) >= LABEL_CLEARANCE;

  // Two thresholds close together would print over each other; pushing them
  // apart from their shared midpoint keeps both numbers under their own edge.
  const crowded = orangeAt - redAt < 0.1;

  const tick = (position: number, text: string, align: 'center' | 'start' | 'end') => (
    <span
      className="absolute whitespace-nowrap"
      style={{
        left: pct(position),
        transform: align === 'center' ? 'translateX(-50%)' : align === 'end' ? 'translateX(-100%)' : undefined,
      }}
    >
      {text}
    </span>
  );

  const nowAlign = nowAt === null ? 'center' : nowAt < 0.1 ? 'start' : nowAt > 0.9 ? 'end' : 'center';

  return (
    <div className="px-4 pb-2.5 pt-3" aria-hidden>
      <div className="relative h-1.5">
        <div className="flex h-full overflow-hidden rounded-full">
          <span className="h-full bg-alarm" style={{ width: pct(redAt) }} />
          <span className="h-full bg-warn" style={{ width: pct(orangeAt - redAt) }} />
          {/* Fades out to the right: the OK band has no upper edge, and a solid
              bar would suggest one at the end of the axis. Plain linear-gradient
              rather than Tailwind's, which interpolates in oklab — syntax older
              iOS drops, leaving no band at all. */}
          <span
            className="h-full flex-1"
            style={{ background: 'linear-gradient(90deg, var(--ok), var(--ok-soft))' }}
          />
        </div>
        {nowAt !== null && (
          <span
            data-testid="scale-now"
            className="absolute -top-1.5 h-[1.125rem] w-[3px] -translate-x-1/2 rounded-full bg-text"
            style={{ left: pct(nowAt) }}
          />
        )}
      </div>
      <div className="tnum relative mt-1.5 h-4 text-[0.6875rem] text-text-tertiary">
        {redAt >= 0.06 && clear(0) && tick(0, '0', 'start')}
        {red > 0 && clear(redAt) && tick(redAt, String(red), crowded ? 'end' : 'center')}
        {clear(orangeAt) && tick(orangeAt, String(orange), crowded ? 'start' : 'center')}
        {(nowAt === null || nowAt < 0.8) && (
          <span className="absolute right-0 whitespace-nowrap">MW</span>
        )}
        {nowAt !== null && margin !== null && (
          <span className="font-semibold text-text">
            {tick(nowAt, `teraz ${margin > 0 ? '+' : ''}${formatMW(margin)}`, nowAlign)}
          </span>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------- application */

const INSTALL_HELP: Record<'ios' | 'manual', string> = {
  ios: 'W Safari stuknij Udostępnij, a potem Dodaj do ekranu głównego.',
  manual: 'W menu przeglądarki wybierz Dodaj do ekranu głównego albo Zainstaluj aplikację.',
};

const InstallRow: React.FC<{
  installableState: InstallableState;
  isInstalled: boolean;
  onInstall: () => Promise<void>;
}> = ({ installableState, isInstalled, onInstall }) => {
  const [helpOpen, setHelpOpen] = useState(false);
  const helpId = useId();
  if (isInstalled || installableState === false) return null;

  /*
   * Hidden above 80rem, as the old button at the foot of the dashboard was:
   * a screen left open all day on a monitor is not something anyone installs
   * from, and Chrome still offers it from its own address bar there.
   */
  if (installableState === true) {
    return (
      <button
        type="button"
        onClick={() => void onInstall()}
        className="flex min-h-11 w-full items-center px-4 text-left text-[1.0625rem] text-accent-text active:bg-surface-3 xl:hidden"
      >
        Dodaj do ekranu głównego
      </button>
    );
  }

  return (
    <div className="xl:hidden">
      <button
        type="button"
        onClick={() => setHelpOpen((open) => !open)}
        aria-expanded={helpOpen}
        aria-controls={helpId}
        className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-[1.0625rem] text-accent-text active:bg-surface-3"
      >
        <span className="flex-1">Jak dodać do ekranu głównego</span>
        <ChevronDownIcon
          className={`h-4 w-4 text-text-tertiary transition-transform duration-200 ${helpOpen ? '' : '-rotate-90'}`}
        />
      </button>
      <p id={helpId} hidden={!helpOpen} className="px-4 pb-3 text-[0.9375rem] leading-snug text-text-secondary">
        {INSTALL_HELP[installableState]}
      </p>
    </div>
  );
};

/* -------------------------------------------------------------------- body */

const SettingsContent: React.FC<SettingsContentProps> = ({
  settings,
  onSave,
  onReset,
  theme,
  onThemeChange,
  currentMargin,
  installableState,
  isInstalled,
  onInstall,
  version,
  layout,
  onToggleCard,
  onChartChange,
  onLayoutReset,
  active,
}) => {
  const thresholdsId = useId();
  const appId = useId();
  const [resetKey, setResetKey] = useState(0);

  const commitThreshold = useCallback(
    (field: ThresholdField, value: number) =>
      onSave(field === 'orange' ? { orangeThreshold: value } : { redThreshold: value }),
    [onSave]
  );

  const atDefaults =
    settings.orangeThreshold === DEFAULT_ORANGE_THRESHOLD &&
    settings.redThreshold === DEFAULT_RED_THRESHOLD;

  return (
    <>
      <SectionHeader id={thresholdsId} first>
        Progi marginesu
      </SectionHeader>
      <Group labelledBy={thresholdsId}>
        {/* Keyed on reset so a field holding an unsaved, invalid draft is
            rebuilt too — its saved value may not have changed at all. */}
        <ThresholdRow
          key={`orange-${resetKey}`}
          field="orange"
          label="Uwaga"
          dotClass="bg-warn"
          saved={settings.orangeThreshold}
          other={settings.redThreshold}
          onCommit={commitThreshold}
          active={active}
        />
        <ThresholdRow
          key={`red-${resetKey}`}
          field="red"
          label="Alarm"
          dotClass="bg-alarm"
          saved={settings.redThreshold}
          other={settings.orangeThreshold}
          onCommit={commitThreshold}
          active={active}
        />
        <ThresholdScale
          orange={settings.orangeThreshold}
          red={settings.redThreshold}
          margin={currentMargin}
        />
      </Group>
      <SectionFooter>
        Margines to dostępna rezerwa minus wymagana. Progi zmieniają kolor paska, wykresu i listy
        alertów. Zmiany zapisują się same.
      </SectionFooter>

      <LayoutSection
        layout={layout}
        onToggleCard={onToggleCard}
        onChartChange={onChartChange}
        onReset={onLayoutReset}
      />

      <SectionHeader>Wygląd</SectionHeader>
      <Group>
        <div className="p-2">
          <SegmentedControl
            ariaLabel="Motyw"
            role="radiogroup"
            value={theme}
            onChange={onThemeChange}
            segments={THEME_OPTIONS}
          />
        </div>
      </Group>

      <SectionHeader id={appId}>Aplikacja</SectionHeader>
      <Group labelledBy={appId}>
        <button
          type="button"
          onClick={() => {
            onReset();
            setResetKey((key) => key + 1);
          }}
          disabled={atDefaults}
          className="flex min-h-11 w-full items-center px-4 text-left text-[1.0625rem] text-accent-text active:bg-surface-3 disabled:text-text-tertiary"
        >
          Przywróć progi {DEFAULT_ORANGE_THRESHOLD} i {DEFAULT_RED_THRESHOLD} MW
        </button>
        <InstallRow installableState={installableState} isInstalled={isInstalled} onInstall={onInstall} />
        <div className="flex min-h-11 items-center px-4 text-[1.0625rem]">
          <span className="flex-1 text-text">Wersja</span>
          <span className="tnum text-text-secondary">{version}</span>
        </div>
      </Group>
    </>
  );
};

export default SettingsContent;
