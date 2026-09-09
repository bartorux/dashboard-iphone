import React from 'react';
import { DayOffset } from '../types';
import { dayTab } from '../utils/dayWindow';
import SegmentedControl from './SegmentedControl';

interface DayNavigationProps {
  /** Which days to offer, as offsets from today. Not contiguous — see dayWindow. */
  offsets: DayOffset[];
  currentDay: DayOffset;
  onSwitchDay: (offset: DayOffset) => void;
}

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
 *
 * The width is AT MOST 34rem, matching the view switcher inside the card below
 * to the pixel, and shrinks with the column: a fixed 34rem overflowed into the
 * margin card once the third column arrived at 1536px, where the chart column
 * is narrower than 34rem. Five segments divide 34rem into 108px each against
 * the 47px a label needs, so widening it would buy nothing.
 */
const DayNavigation: React.FC<DayNavigationProps> = ({
  offsets,
  currentDay,
  onSwitchDay,
}) => (
  <div className="mx-3 mt-3 xl:pl-3">
    <SegmentedControl
      ariaLabel="Wybór dnia"
      value={currentDay}
      onChange={onSwitchDay}
      segments={offsets.map((offset) => ({ value: offset, ...dayTab(offset) }))}
      className="xl:w-full xl:max-w-[34rem]"
    />
  </div>
);

export default DayNavigation;
