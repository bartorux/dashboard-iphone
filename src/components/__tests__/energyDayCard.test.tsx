import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EnergyDayCard from '../EnergyDayCard';
import { ENERGY_DAY_GREETING, ENERGY_DAY_ORIGIN } from '../../utils/energyDay';

describe('EnergyDayCard', () => {
  it('shows the date, the wish and what the day is', () => {
    render(<EnergyDayCard />);

    // Visible, not merely present: getByText finds hidden nodes too, so
    // toBeInTheDocument would pass on a line the reader cannot see.
    expect(screen.getByText('14 sierpnia')).toBeVisible();
    expect(screen.getByText(ENERGY_DAY_GREETING)).toBeVisible();
    expect(screen.getByText(ENERGY_DAY_ORIGIN)).toBeVisible();
  });

  it('borrows no status colour', () => {
    /*
     * Green here means OK and red means alarm. The fourteenth of August is as
     * likely as any day to carry an alarm, and a celebration sitting in
     * reassuring green above a red chart would read as a contradiction on the
     * one morning nobody would think to check it. The accent is used instead —
     * the colour this app gives to things worth the eye, which claims nothing
     * about the grid.
     */
    const { container } = render(<EnergyDayCard />);
    const klasy = container.innerHTML;

    expect(klasy).not.toMatch(/bg-ok|bg-alarm|bg-warn|text-ok|text-alarm|text-warn/);
    expect(klasy).toMatch(/bg-accent-soft/);
  });
});
