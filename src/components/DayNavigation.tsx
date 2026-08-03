import React from 'react';
import { DayOffset } from '../types';
import { DAY_NAMES } from '../utils/constants';
import { getDayDate } from '../utils/dateHelpers';

interface DayNavigationProps {
  currentDay: DayOffset;
  onSwitchDay: (offset: DayOffset) => void;
}

const DAYS: DayOffset[] = [0, 1, 2];

/** iOS-style segmented control: a sliding pill instead of three filled buttons. */
const DayNavigation: React.FC<DayNavigationProps> = ({
  currentDay,
  onSwitchDay,
}) => (
  <div className="mx-3 mt-3">
    <div
      role="tablist"
      aria-label="Wybór dnia"
      className="relative flex rounded-xl bg-surface-3 p-1"
    >
      <div
        aria-hidden
        className="absolute inset-y-1 rounded-[10px] bg-surface shadow-sm transition-transform duration-300 ease-out"
        style={{
          width: `calc((100% - 0.5rem) / ${DAYS.length})`,
          transform: `translateX(calc(${currentDay} * 100%))`,
          left: '0.25rem',
        }}
      />

      {DAYS.map((offset) => {
        const active = currentDay === offset;
        return (
          <button
            key={offset}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSwitchDay(offset)}
            className={`relative z-10 flex-1 rounded-[10px] py-2 text-center transition-colors ${
              active ? 'text-text' : 'text-text-secondary'
            }`}
          >
            <span className="block text-[13px] font-semibold leading-tight">
              {DAY_NAMES[offset]}
            </span>
            <span className="tnum block text-[11px] text-text-tertiary">
              {getDayDate(offset)}
            </span>
          </button>
        );
      })}
    </div>
  </div>
);

export default DayNavigation;
