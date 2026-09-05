import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  it('marks the current hour bar with the neutral inset ring', () => {
    /*
     * The colour pass found the original emphasis (opacity alone) at 1.75:1
     * between bars — invisible in practice — and replaced it with a
     * hue-independent inset ring. Nothing pinned that mechanism, so a
     * refactor could drop it and every test would stay green; this one makes
     * the current-hour marker load-bearing.
     */
    render(<RenewableMixCard points={points} kseDemand={flatKseDemand()} now={NOW} />);
    // NOW is 10:30, so the running block is 10:00-11:00.
    const biezacy = screen.getByLabelText(/^10:00/);
    expect(biezacy.className).toContain('ring-inset');
  });

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

  it('labels each bar with an accessible name "HH:00 · NN%"', () => {
    render(<RenewableMixCard points={points} kseDemand={flatKseDemand()} now={NOW} />);

    expect(screen.getByLabelText('12:00 · 50%')).toBeInTheDocument();
  });

  it('renders an empty slot, not a fabricated bar, for an hour with no data', () => {
    const gappy = points.filter((point) => point.hourLabel !== '18:00');
    render(<RenewableMixCard points={gappy} kseDemand={flatKseDemand()} now={NOW} />);

    expect(screen.getAllByTestId('oze-hour-slot')).toHaveLength(24);
    // The gap gets an honest dash, not a silently-missing bar or a guessed number.
    expect(screen.getByLabelText('18:00 · —')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^18:00 · \d/)).not.toBeInTheDocument();
  });
});

/**
 * jsdom's getBoundingClientRect always answers all-zero — the component
 * treats a zero-width rect as "no strip to scrub" (see hourFromClientX's own
 * guard against that), so a scrub test needs a real box or every pointer
 * event is silently ignored. 2400px / 24 bars = a clean 100px per hour.
 */
function mockStripRect(strip: HTMLElement) {
  vi.spyOn(strip, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    right: 2400,
    width: 2400,
    top: 0,
    bottom: 64,
    height: 64,
    x: 0,
    y: 0,
    toJSON() {},
  } as DOMRect);
}

// Hour 14 carries its own distinct share (100%, vs. the fixture's flat 50%
// everywhere else) so a header swap during scrub is provable rather than
// coincidentally identical to the resting 10:00 reading.
const scrubPoints = points.map((point) =>
  point.hourLabel === '14:00' ? { ...point, pv: 2000, wind: 2000 } : point
);

describe('RenewableMixCard hour scrubbing', () => {
  it('touching/hovering a bar swaps the ring percent and hour caption to that hour', () => {
    render(<RenewableMixCard points={scrubPoints} kseDemand={flatKseDemand()} now={NOW} />);
    const strip = screen.getByTestId('oze-hour-strip');
    mockStripRect(strip);

    fireEvent.pointerDown(strip, { clientX: 1450, pointerId: 1 }); // inside hour 14's 1400-1500 span

    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('14:00–15:00')).toBeInTheDocument();
    // The resting 10:00/50% reading is replaced, not merely joined.
    expect(screen.queryByText('50%')).not.toBeInTheDocument();
  });

  it('releasing a MOUSE pointer snaps back to the current hour immediately', () => {
    // Mouse semantics are unchanged by the touch-latch feedback round: a
    // mouse can always come back and re-hover, so release still just drops
    // back to "now" — no pinning. pointerType is explicit here because the
    // release behaviour now genuinely branches on it.
    render(<RenewableMixCard points={scrubPoints} kseDemand={flatKseDemand()} now={NOW} />);
    const strip = screen.getByTestId('oze-hour-strip');
    mockStripRect(strip);

    fireEvent.pointerDown(strip, { clientX: 1450, pointerId: 1, pointerType: 'mouse' });
    expect(screen.getByText('100%')).toBeInTheDocument();

    fireEvent.pointerUp(strip, { clientX: 1450, pointerId: 1, pointerType: 'mouse' });

    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('10:00–11:00')).toBeInTheDocument();
  });

  it('a touch release LATCHES the reading on the touched hour instead of snapping back', () => {
    // The owner's live-iPhone feedback: a tap is a down+up in a fraction of a
    // second, so a reading that only shows while the finger is still down
    // flashes and vanishes before it can be read — and the finger is sitting
    // right on top of the bar the whole time anyway. So on touch/pen,
    // pointerup pins the reading instead of clearing it.
    render(<RenewableMixCard points={scrubPoints} kseDemand={flatKseDemand()} now={NOW} />);
    const strip = screen.getByTestId('oze-hour-strip');
    mockStripRect(strip);

    fireEvent.pointerDown(strip, { clientX: 1450, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerUp(strip, { clientX: 1450, pointerId: 1, pointerType: 'touch' });

    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('14:00–15:00')).toBeInTheDocument();
    expect(screen.queryByText('50%')).not.toBeInTheDocument();
  });

  it('a new drag overrides an existing latch live, not only after release', () => {
    // The live gesture must win over the pinned reading: with the precedence
    // flipped (latch over gesture) a finger dragging across the strip would
    // read the OLD pinned hour until release — invisible to every other test.
    render(<RenewableMixCard points={scrubPoints} kseDemand={flatKseDemand()} now={NOW} />);
    const strip = screen.getByTestId('oze-hour-strip');
    mockStripRect(strip);

    fireEvent.pointerDown(strip, { clientX: 1450, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerUp(strip, { clientX: 1450, pointerId: 1, pointerType: 'touch' });
    expect(screen.getByText('14:00–15:00')).toBeInTheDocument();

    fireEvent.pointerDown(strip, { clientX: 850, pointerId: 2, pointerType: 'touch' });

    expect(screen.getByText('08:00–09:00')).toBeInTheDocument();
    expect(screen.queryByText('14:00–15:00')).not.toBeInTheDocument();
  });

  it('a second tap on the already-latched bar releases it back to the current hour', () => {
    render(<RenewableMixCard points={scrubPoints} kseDemand={flatKseDemand()} now={NOW} />);
    const strip = screen.getByTestId('oze-hour-strip');
    mockStripRect(strip);

    // First tap latches onto hour 14.
    fireEvent.pointerDown(strip, { clientX: 1450, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerUp(strip, { clientX: 1450, pointerId: 1, pointerType: 'touch' });
    expect(screen.getByText('100%')).toBeInTheDocument(); // confirms it actually latched first

    // Second tap on the SAME bar is the "undo" gesture.
    fireEvent.pointerDown(strip, { clientX: 1450, pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerUp(strip, { clientX: 1450, pointerId: 2, pointerType: 'touch' });

    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('10:00–11:00')).toBeInTheDocument();
  });

  it('a pointerdown outside the strip releases an active latch', () => {
    render(<RenewableMixCard points={scrubPoints} kseDemand={flatKseDemand()} now={NOW} />);
    const strip = screen.getByTestId('oze-hour-strip');
    mockStripRect(strip);

    fireEvent.pointerDown(strip, { clientX: 1450, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerUp(strip, { clientX: 1450, pointerId: 1, pointerType: 'touch' });
    expect(screen.getByText('100%')).toBeInTheDocument();

    // Anywhere outside the strip — the document-level listener the component
    // installs while latched, not a handler on the strip itself.
    fireEvent.pointerDown(document.body, { pointerType: 'touch' });

    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('10:00–11:00')).toBeInTheDocument();
  });

  it('a cancelled pointer (vertical scroll stealing the touch) snaps back, even from a latched state', () => {
    // On a phone, touch-action: pan-y hands a vertical drag to the page scroll
    // and the browser fires pointercancel, never pointerup — without this path
    // the scrub would stick on whatever hour the finger last crossed. Checked
    // here starting from an existing latch too: a cancelled gesture is a full
    // revert, not just "stop updating", so it must drop a prior pin as well.
    render(<RenewableMixCard points={scrubPoints} kseDemand={flatKseDemand()} now={NOW} />);
    const strip = screen.getByTestId('oze-hour-strip');
    mockStripRect(strip);

    // Latch onto hour 14 with an ordinary tap first.
    fireEvent.pointerDown(strip, { clientX: 1450, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerUp(strip, { clientX: 1450, pointerId: 1, pointerType: 'touch' });
    expect(screen.getByText('100%')).toBeInTheDocument();

    // A new touch starts dragging elsewhere, then the page scroll steals it.
    fireEvent.pointerDown(strip, { clientX: 50, pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerCancel(strip, { pointerId: 2, pointerType: 'touch' });

    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('10:00–11:00')).toBeInTheDocument();
  });

  it('sliding off the strip also snaps back to the current hour', () => {
    render(<RenewableMixCard points={scrubPoints} kseDemand={flatKseDemand()} now={NOW} />);
    const strip = screen.getByTestId('oze-hour-strip');
    mockStripRect(strip);

    fireEvent.pointerDown(strip, { clientX: 1450, pointerId: 1 });
    expect(screen.getByText('100%')).toBeInTheDocument();

    fireEvent.pointerLeave(strip, { clientX: 1450, pointerId: 1 });

    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('marks the scrubbed bar with its own ring, distinct from the current-hour ring', () => {
    render(<RenewableMixCard points={scrubPoints} kseDemand={flatKseDemand()} now={NOW} />);
    const strip = screen.getByTestId('oze-hour-strip');
    mockStripRect(strip);

    fireEvent.pointerDown(strip, { clientX: 1450, pointerId: 1 }); // hour 14

    const scrubbed = screen.getByLabelText('14:00 · 100%');
    expect(scrubbed.className).toContain('ring-2');
    // Untouched by the scrub: the current-hour bar keeps its own, thinner ring.
    const biezacy = screen.getByLabelText(/^10:00/);
    expect(biezacy.className).toContain('ring-1');
    expect(biezacy.className).not.toContain('ring-2');
  });

  it('marks the ring with data-scrub while a pointer is actively down on the strip', () => {
    // .oze-ring-fill[data-scrub="true"] (App.css) is what zeroes the ring's
    // transition duration during a drag — this pins the attribute the CSS
    // rule keys on, not the visual effect itself.
    const { container } = render(
      <RenewableMixCard points={scrubPoints} kseDemand={flatKseDemand()} now={NOW} />
    );
    const strip = screen.getByTestId('oze-hour-strip');
    mockStripRect(strip);
    const ring = container.querySelector('.oze-ring-fill');
    expect(ring).toHaveAttribute('data-scrub', 'false');

    fireEvent.pointerDown(strip, { clientX: 1450, pointerId: 1, pointerType: 'touch' });
    expect(ring).toHaveAttribute('data-scrub', 'true');

    fireEvent.pointerUp(strip, { clientX: 1450, pointerId: 1, pointerType: 'touch' });
    expect(ring).toHaveAttribute('data-scrub', 'false');
  });

  it('scrubbing an hour with no data shows a dash, not a fabricated percent', () => {
    const gappy = scrubPoints.filter((point) => point.hourLabel !== '18:00');
    render(<RenewableMixCard points={gappy} kseDemand={flatKseDemand()} now={NOW} />);
    const strip = screen.getByTestId('oze-hour-strip');
    mockStripRect(strip);

    fireEvent.pointerDown(strip, { clientX: 1850, pointerId: 1 }); // inside hour 18's 1800-1900 span

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('18:00–19:00')).toBeInTheDocument();
    expect(screen.queryByText('50%')).not.toBeInTheDocument();
  });
});
