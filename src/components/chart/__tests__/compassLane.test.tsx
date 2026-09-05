import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CompassLane from '../CompassLane';
import { CompassRange } from '../../../utils/compass';

const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

function cells() {
  return Array.from(screen.getByTestId('compass-lane').querySelectorAll(':scope > div > div'));
}
/** A cell is painted when it carries either fill or hatching, never otherwise. */
function painted() {
  return cells().filter((cell) => {
    const style = cell.getAttribute('style') ?? '';
    return style.includes('background');
  });
}

describe('CompassLane', () => {
  it('renders nothing at all when the operator asks for nothing', () => {
    // Almost every hour of almost every day. An empty lane would be permanent
    // furniture announcing nothing, and would kill the "it appeared" reflex.
    const { container } = render(<CompassLane ranges={[]} hourKeys={HOURS} axisWidth={40} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('paints exactly the flagged hours, not one block more', () => {
    /*
     * `to` in a CompassRange is the label AFTER the last flagged hour, so a
     * lane that matched from..to would paint one extra block at the end of
     * every range. This walks `hours` blocks from `from` instead, and this
     * test is what keeps it that way.
     */
    const ranges: CompassRange[] = [{ level: 2, from: '19:00', to: '21:00', hours: 2 }];
    render(<CompassLane ranges={ranges} hourKeys={HOURS} axisWidth={40} />);

    expect(painted()).toHaveLength(2);
    const all = cells();
    expect(painted()).toEqual([all[19], all[20]]);
  });

  it('gives level 3 a solid fill and level 2 hatching, so the level survives greyscale', () => {
    const ranges: CompassRange[] = [
      { level: 2, from: '06:00', to: '07:00', hours: 1 },
      { level: 3, from: '20:00', to: '21:00', hours: 1 },
    ];
    render(<CompassLane ranges={ranges} hourKeys={HOURS} axisWidth={40} />);

    const all = cells();
    expect(all[6].getAttribute('style')).toContain('repeating-linear-gradient');
    expect(all[20].getAttribute('style')).not.toContain('repeating-linear-gradient');
    expect(all[20].getAttribute('style')).toContain('var(--compass)');
  });

  it('has one cell per hour of the chart, which is what keeps it aligned', () => {
    // The lane's whole alignment claim rests on repeat(n, 1fr) matching the
    // categorical X axis one for one. A mismatch here is a lane that lies
    // about which hour is flagged.
    render(
      <CompassLane
        ranges={[{ level: 3, from: '00:00', to: '01:00', hours: 1 }]}
        hourKeys={HOURS.slice(0, 12)}
        axisWidth={40}
      />
    );
    expect(cells()).toHaveLength(12);
  });

  it('is hidden from screen readers, because the alerts card already says it in words', () => {
    render(
      <CompassLane
        ranges={[{ level: 3, from: '20:00', to: '21:00', hours: 1 }]}
        hourKeys={HOURS}
        axisWidth={40}
      />
    );
    expect(screen.getByTestId('compass-lane')).toHaveAttribute('aria-hidden', 'true');
  });
});
