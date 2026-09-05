import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';

/*
 * ResponsiveContainer measures its parent, and jsdom reports every element as
 * zero by zero, so Recharts renders nothing at all inside it. Fixing the size is
 * the whole reason this file can assert on what the chart drew.
 */
vi.mock('recharts', async () => {
  const real = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...real,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
      React.cloneElement(children as React.ReactElement<{ width: number; height: number }>, {
        width: 800,
        height: 400,
      }),
  };
});
import React from 'react';
import ReserveChart, { ReserveTooltip } from '../ReserveChart';
import { makePoint } from '../../test/factories';
import { formatMW } from '../../utils/format';

const pad = (h: number) => String(h).padStart(2, '0');

/**
 * 08:00 breaches the red threshold, 09:00 only the orange one; every other hour
 * is comfortable. One of each severity, so the marks can be told apart.
 */
const day = Array.from({ length: 24 }, (_, hour) =>
  makePoint({
    businessDate: '2026-08-11',
    hourLabel: `${pad(hour)}:00`,
    endLabel: `${pad((hour + 1) % 24)}:00`,
    reserve: hour === 8 ? 2135 : hour === 9 ? 2260 : 5000,
    required: 1900,
  })
);

const chart = (currentHourLabel: string | null) =>
  render(
    <ReserveChart
      data={day}
      orangeThreshold={500}
      redThreshold={300}
      currentHourLabel={currentHourLabel}
    />
  ).container;

const alertDots = (container: HTMLElement) => [
  ...container.querySelectorAll('circle[data-alert]'),
];

const referenceLines = (container: HTMLElement) => [
  ...container.querySelectorAll('.recharts-reference-line line'),
];

/** Effective alpha of a gradient stop: the token's own alpha × stop-opacity. */
const stopAlpha = (stop: Element) => {
  const colour = stop.getAttribute('stop-color') ?? '';
  const alpha = Number(/rgba\([^)]*,\s*([\d.]+)\s*\)/.exec(colour)?.[1] ?? 1);
  return alpha * Number(stop.getAttribute('stop-opacity') ?? 1);
};

describe('ReserveChart — jak zaznacza godziny alertowe', () => {
  /*
   * These hours used to be drawn as one dashed rule per hour, from the top of
   * the plot to the axis. On a day with a long thin evening that is a dozen
   * full-height lines across the picture — too faint at strokeOpacity 0.55 to
   * state anything, too many to stay out of the way. The information moved onto
   * the curve, where the reader is already looking and where the mark also says
   * how deep the hour went.
   */
  it('marks an alert hour with a dot on the curve, not a rule across the plot', () => {
    const container = chart('12:00');

    expect(alertDots(container).map((d) => d.getAttribute('data-alert'))).toEqual(
      ['alarm', 'warn']
    );
    // Only the regulatory threshold and "teraz" still cross the whole plot.
    expect(referenceLines(container)).toHaveLength(2);
  });

  it('separates the two severities by colour', () => {
    const container = chart('12:00');
    const [alarm, warn] = alertDots(container);

    expect(alarm.getAttribute('fill')).not.toBe(warn.getAttribute('fill'));
  });

  /*
   * The failure this file was written for: the alert rule and the "teraz" line
   * landed on the same x, and the blue line painted over the red dash — the
   * header went red, the panel listed the range, and the chart showed nothing at
   * the one hour already happening. The old fix was a special case, full
   * strokeOpacity on that one hour and 0.55 everywhere else, which is why the
   * marks were too faint to begin with.
   *
   * A dot needs no such compensation: Recharts puts a line's dots in a layer of
   * their own, drawn after the series and after every reference line (measured
   * — moving the "teraz" rule to the end of the chart's children does not move
   * the dots). So the mark on the current hour is the same mark as any other,
   * and the day this stops being true the chart is compensating again.
   */
  it('marks the current hour exactly as it marks any other', () => {
    const onNow = alertDots(chart('08:00'))[0];
    const elsewhere = alertDots(chart('12:00'))[0];

    const shape = (dot: Element) =>
      ['fill', 'r', 'stroke', 'stroke-width', 'stroke-opacity', 'opacity'].map(
        (attr) => dot.getAttribute(attr)
      );

    expect(shape(onNow)).toEqual(shape(elsewhere));
  });

  it('rings the dot in the surface colour, so it reads on the line it sits on', () => {
    const container = chart('12:00');
    const dot = alertDots(container)[0];

    expect(dot.getAttribute('stroke')).toBe('#ffffff');
    expect(dot.getAttribute('stroke-width')).toBe('2');
  });

  /*
   * r=4, not 3.5. With the 2px surface ring, the painted disc is 8px across —
   * exactly the floor a marker has to clear to stay findable on a phone held
   * at arm's length. Half a pixel of radius is below what a 0.1%
   * visual-regression pixel-count threshold reliably catches at chart scale
   * (a handful of pixels on one dot, out of hundreds of thousands on the
   * page), so this value has to be pinned directly rather than left to the
   * screenshot suite to notice if it silently regressed.
   */
  it('draws the alert dot at r=4, not the pre-fix r=3.5', () => {
    const container = chart('12:00');
    const dots = alertDots(container);

    expect(dots.length).toBeGreaterThan(0);
    for (const dot of dots) {
      expect(dot.getAttribute('r')).toBe('4');
    }
  });
});

describe('ReserveChart — teren', () => {
  /*
   * The alarm zone is the only region here with no bottom: it runs from its
   * boundary to zero. A flat tint therefore paints half the canvas one colour —
   * a wall, where the generation view next door draws bounded shapes on white.
   * The fill carries its weight at the boundary and gives the surface back
   * further down, without ever reaching zero: the tail still says which side of
   * the line is the bad one.
   */
  it('fades the alarm zone toward the axis instead of painting a flat wall', () => {
    const container = chart('12:00');
    const zone = container.querySelector('.recharts-area-area');
    const gradientId = /url\(#(.+)\)/.exec(zone?.getAttribute('fill') ?? '')?.[1];

    expect(gradientId).toBeTruthy();

    const stops = [
      ...container.querySelectorAll(`#${gradientId} stop`),
    ];
    const first = stopAlpha(stops[0]);
    const last = stopAlpha(stops[stops.length - 1]);

    expect(last).toBeLessThan(first / 4);
    expect(last).toBeGreaterThan(0);
  });

  /*
   * With the fill fading away from it, the edge is what holds the band's shape,
   * and a 1px hairline was a hair rather than a boundary. 1.5px is the weight
   * the generation view already gives its area edges — the same kind of mark,
   * so the same weight.
   */
  it('draws both band edges at the generation view’s weight, not a hairline', () => {
    const container = chart('12:00');
    // Source order: alarmTop, warnTop, required, reserve.
    const [alarmEdge, warnEdge] = [
      ...container.querySelectorAll('.recharts-line-curve'),
    ];

    expect(alarmEdge.getAttribute('stroke-width')).toBe('1.5');
    expect(warnEdge.getAttribute('stroke-width')).toBe('1.5');

    // …and those really are the two band edges: each alert dot wears the colour
    // of the boundary it belongs to, which is what lets the dot's colour mean
    // "alarm" rather than merely "not the other one".
    expect(alertDots(container).map((dot) => dot.getAttribute('fill'))).toEqual([
      alarmEdge.getAttribute('stroke'),
      warnEdge.getAttribute('stroke'),
    ]);
  });
});

describe('ReserveChart — tabela godzinowa zgadza się z dymkiem', () => {
  beforeEach(() => localStorage.clear());

  /*
   * Cross-check, not a copy: the expected strings are computed once, straight
   * from the input PSEDataPoint (via the same formatMW everything else in the
   * app uses), and then checked against TWO independent renderings — the
   * tooltip (which only ever exists on hover, and would otherwise be invisible
   * to a chart-level assertion) and the collapsed table beneath the chart.
   * Neither rendering's expected value is copied from the other, so a table
   * that silently dropped a row, or a column that silently reformatted a
   * number, fails this without needing its own hard-coded string.
   */
  it('shows the same reserve, required and margin for an hour in the table as the tooltip prints', () => {
    const targetHour = day[8]; // 08:00, the alarm hour in the module-level `day` fixture
    const margin = targetHour.reserve! - targetHour.required!;
    const expectedReserve = formatMW(targetHour.reserve!);
    const expectedRequired = formatMW(targetHour.required!);
    const expectedMargin = `${margin > 0 ? '+' : ''}${formatMW(margin)}`;

    const tooltipRow = {
      key: targetHour.hourLabel,
      endLabel: targetHour.endLabel,
      reserve: targetHour.reserve,
      required: targetHour.required,
      alert: 'alarm' as const,
    };
    const { container: tooltipContainer } = render(
      <ReserveTooltip
        active
        payload={[{ payload: tooltipRow } as never]}
        label={targetHour.hourLabel}
        orangeThreshold={500}
        redThreshold={300}
      />
    );
    expect(tooltipContainer.textContent).toContain(expectedReserve);
    expect(tooltipContainer.textContent).toContain(expectedRequired);
    expect(tooltipContainer.textContent).toContain(expectedMargin);

    // Scoped to the <table> itself: Recharts pre-renders its own Tooltip
    // content off-screen for sizing even while inactive, so ReserveTooltip's
    // "08:00–09:00" label is *also* sitting in this same container — a query
    // against the whole render would find that copy too.
    const { getByRole, container } = render(
      <ReserveChart
        data={day}
        orangeThreshold={500}
        redThreshold={300}
        currentHourLabel={null}
      />
    );
    fireEvent.click(getByRole('button', { name: 'Tabela godzinowa' }));
    const table = container.querySelector('table')!;
    const row = within(table)
      .getByText(`${targetHour.hourLabel}–${targetHour.endLabel}`)
      .closest('tr')!;

    expect(row.textContent).toContain(expectedReserve);
    expect(row.textContent).toContain(expectedRequired);
    expect(row.textContent).toContain(expectedMargin);
  });
});
