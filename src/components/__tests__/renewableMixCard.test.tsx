import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RenewableMixCard from '../RenewableMixCard';
import { makePoint } from '../../test/factories';

const pad = (h: number) => String(h).padStart(2, '0');

/**
 * 24 hourly points for one business day, each carrying pv 1000 / wind 1000 —
 * a flat 50% share once paired with a 4000 MW kseDemand and zero exchange,
 * so every assertion below can predict its number without re-deriving the
 * formula (that formula has its own coverage in renewableShare.test.ts).
 */
const points = Array.from({ length: 24 }, (_, hour) => {
  const endMs = Date.UTC(2026, 7, 3, hour + 1);
  return makePoint({
    hourLabel: `${pad(hour)}:00`,
    endLabel: `${pad((hour + 1) % 24)}:00`,
    time: new Date(endMs),
    timeStr: `2026-08-03 ${pad((hour + 1) % 24)}:00:00`,
    pv: 1000,
    wind: 1000,
    exchange: 0,
  });
});

function flatKseDemand(): Map<number, number> {
  const map = new Map<number, number>();
  for (let hour = 0; hour < 24; hour++) {
    map.set(Date.UTC(2026, 7, 3, hour), 4000);
  }
  return map;
}

// 10:30 UTC falls inside the block ending 11:00 UTC — hour "10:00" is current.
const NOW = new Date(Date.UTC(2026, 7, 3, 10, 30));

describe('RenewableMixCard', () => {
  it('renders the current hour\'s share in the ring and its aria-label', () => {
    render(<RenewableMixCard points={points} kseDemand={flatKseDemand()} now={NOW} />);

    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(
      screen.getByLabelText(/OZE w krajowym miksie, godzina 10:00: 50%/)
    ).toBeInTheDocument();
  });

  it('does not render at all when kseDemand is empty (PSE has not published today)', () => {
    const { container } = render(
      <RenewableMixCard points={points} kseDemand={new Map()} now={NOW} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('always renders 24 hour slots for the day strip', () => {
    render(<RenewableMixCard points={points} kseDemand={flatKseDemand()} now={NOW} />);

    expect(screen.getAllByTestId('oze-hour-slot')).toHaveLength(24);
  });

  it('titles each bar "HH:00 · NN%"', () => {
    render(<RenewableMixCard points={points} kseDemand={flatKseDemand()} now={NOW} />);

    expect(screen.getByTitle('12:00 · 50%')).toBeInTheDocument();
  });

  it('renders an empty slot, not a fabricated bar, for an hour with no data', () => {
    const gappy = points.filter((point) => point.hourLabel !== '18:00');
    render(<RenewableMixCard points={gappy} kseDemand={flatKseDemand()} now={NOW} />);

    expect(screen.getAllByTestId('oze-hour-slot')).toHaveLength(24);
    expect(screen.queryByTitle(/^18:00/)).not.toBeInTheDocument();
  });
});
