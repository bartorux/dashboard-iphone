import React from 'react';
import { DayOffset } from '../types';
import { DAY_NAMES } from '../utils/constants';
import { getDayDate } from '../utils/dateHelpers';
import SegmentedControl from './SegmentedControl';

interface DayNavigationProps {
  currentDay: DayOffset;
  onSwitchDay: (offset: DayOffset) => void;
}

const DAYS: DayOffset[] = [0, 1, 2];

const DayNavigation: React.FC<DayNavigationProps> = ({
  currentDay,
  onSwitchDay,
}) => (
  <div className="mx-3 mt-3 xl:max-w-[34rem]">
    <SegmentedControl
      ariaLabel="Wybór dnia"
      value={currentDay}
      onChange={onSwitchDay}
      segments={DAYS.map((offset) => ({
        value: offset,
        label: DAY_NAMES[offset],
        sublabel: getDayDate(offset),
      }))}
    />
  </div>
);

export default DayNavigation;
