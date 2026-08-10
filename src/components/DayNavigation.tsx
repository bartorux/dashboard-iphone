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

/**
 * On a monitor this control and the view switcher inside the chart card have to
 * agree on two things, and both are set here rather than left to fall out of the
 * layout.
 *
 * `xl:pl-3` repeats the card's padding, so the two start on exactly the same
 * vertical line; twelve pixels apart is too little to read as an offset and
 * exactly enough to read as sloppy. The width goes on the control itself rather
 * than the wrapper, because padding on the wrapper is subtracted from a
 * max-width and the pair would end up the same distance apart, just at the other
 * end.
 */
const DayNavigation: React.FC<DayNavigationProps> = ({
  currentDay,
  onSwitchDay,
}) => (
  <div className="mx-3 mt-3 xl:pl-3">
    <SegmentedControl
      ariaLabel="Wybór dnia"
      value={currentDay}
      onChange={onSwitchDay}
      segments={DAYS.map((offset) => ({
        value: offset,
        label: DAY_NAMES[offset],
        sublabel: getDayDate(offset),
      }))}
      className="xl:w-[34rem]"
    />
  </div>
);

export default DayNavigation;
