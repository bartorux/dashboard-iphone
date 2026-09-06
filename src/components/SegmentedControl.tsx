import React from 'react';

export interface Segment<T extends string | number> {
  value: T;
  label: string;
  /** Optional second line, e.g. the date under a day name. */
  sublabel?: string;
}

interface SegmentedControlProps<T extends string | number> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Announced to assistive technology as the purpose of the group. */
  ariaLabel: string;
  /** 'tablist' switches a view, 'radiogroup' picks a setting. */
  role?: 'tablist' | 'radiogroup';
  className?: string;
}

/**
 * iOS-style segmented control with a pill that slides to the active option.
 * Shared so the day picker, the chart view switcher and the theme setting stay
 * one mechanic with one appearance.
 */
export function SegmentedControl<T extends string | number>({
  segments,
  value,
  onChange,
  ariaLabel,
  role = 'tablist',
  className = '',
}: SegmentedControlProps<T>) {
  const activeIndex = Math.max(
    0,
    segments.findIndex((segment) => segment.value === value)
  );
  const optionRole = role === 'tablist' ? 'tab' : 'radio';
  const buttonRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // WAI-ARIA tabs/radiogroup pattern: roving tabindex (only the active button
  // sits in the Tab order; arrows move within the group) with automatic
  // activation — the arrow itself commits the new value, there is no separate
  // "confirm" step, since every caller here is a view switch or a setting
  // pick rather than a multi-field form. Wrapping at the ends matches the
  // pill's own closed loop: there is no visible first/last edge that should
  // stop movement.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const count = segments.length;
    if (count === 0) return;

    let nextIndex: number;
    switch (event.key) {
      case 'ArrowLeft':
        nextIndex = (activeIndex - 1 + count) % count;
        break;
      case 'ArrowRight':
        nextIndex = (activeIndex + 1) % count;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = count - 1;
        break;
      default:
        // Anything else (Tab, Enter, letters...) is left alone — swallowing
        // it here would also block the browser's own focus movement.
        return;
    }

    event.preventDefault();
    onChange(segments[nextIndex].value);
    buttonRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      role={role}
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={`relative flex rounded-xl bg-surface-3 p-1 ${className}`}
    >
      <div
        aria-hidden
        className="absolute inset-y-1 rounded-[10px] bg-surface shadow-sm transition-transform duration-[220ms] ease-[cubic-bezier(0.23,1,0.32,1)]"
        style={{
          width: `calc((100% - 0.5rem) / ${segments.length})`,
          transform: `translateX(calc(${activeIndex} * 100%))`,
          left: '0.25rem',
        }}
      />

      {segments.map((segment, index) => {
        const active = segment.value === value;
        return (
          <button
            key={segment.value}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role={optionRole}
            {...(optionRole === 'tab'
              ? { 'aria-selected': active }
              : { 'aria-checked': active })}
            // Roving tabindex: exactly one segment is a Tab stop at a time, so
            // moving through a page of segmented controls costs one Tab each,
            // not one per segment — the rest is reached with the arrow keys.
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(segment.value)}
            // .segment-button, not the transition-colors/transition-transform
            // utility pair: transition-property is a longhand, so a second
            // transition-* class does not add to the first, it replaces it
            // outright - the colour crossfade would have gone silently dead
            // the moment the press-scale's own transition utility landed
            // beside it. See the rule in App.css for the combined value.
            className={`segment-button relative z-10 min-h-9 flex-1 rounded-[10px] px-1 text-center active:scale-[0.97] ${
              active ? 'text-text' : 'text-text-secondary'
            }`}
          >
            <span className="block text-[0.8125rem] font-semibold leading-tight">
              {segment.label}
            </span>
            {segment.sublabel && (
              <span className="tnum block text-[0.6875rem] text-text-tertiary">
                {segment.sublabel}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
