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

  return (
    <div
      role={role}
      aria-label={ariaLabel}
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

      {segments.map((segment) => {
        const active = segment.value === value;
        return (
          <button
            key={segment.value}
            type="button"
            role={optionRole}
            {...(optionRole === 'tab'
              ? { 'aria-selected': active }
              : { 'aria-checked': active })}
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
