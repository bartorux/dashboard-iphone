import React from 'react';
import { DayOffset } from '../types';
import { DAY_NAMES } from '../utils/constants';
import { getDayDate } from '../utils/dateHelpers';

interface DayNavigationProps {
  currentDay: DayOffset;
  onSwitchDay: (offset: DayOffset) => void;
}

const DayNavigation: React.FC<DayNavigationProps> = ({
  currentDay,
  onSwitchDay,
}) => (
  <div className="bg-white px-3 py-2 border-b border-[#e5e5ea]">
    <div className="flex gap-2">
      {([0, 1, 2] as DayOffset[]).map((offset) => (
        <button
          key={offset}
          onClick={() => onSwitchDay(offset)}
          className={`flex-1 rounded-[10px] py-3 px-2 text-center cursor-pointer transition-all text-[13px] border active:scale-[0.98] ${
            currentDay === offset
              ? 'bg-gradient-to-br from-[#c0392b] to-[#e74c3c] text-white border-[#c0392b] shadow-[0_2px_8px_rgba(192,57,43,0.3)]'
              : 'bg-[#f2f2f7] border-[#e5e5ea]'
          }`}
        >
          <div className="font-semibold mb-0.5">{DAY_NAMES[offset]}</div>
          <div
            className={`text-[11px] ${
              currentDay === offset ? 'opacity-90' : 'opacity-80'
            }`}
          >
            {getDayDate(offset)}
          </div>
        </button>
      ))}
    </div>
  </div>
);

export default DayNavigation;
