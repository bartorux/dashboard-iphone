import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

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
import ReserveChart from '../ReserveChart';
import { makePoint } from '../../test/factories';

/**
 * The alert marking and the "teraz" line can land on the same hour, and when
 * they did the blue line was painted over the red dash — so the header went red,
 * the panel listed the range, and the chart showed nothing at the one hour
 * already happening. Measured live: two rules at the same x, one visible.
 */
const pad = (h: number) => String(h).padStart(2, '0');

const day = Array.from({ length: 24 }, (_, hour) =>
  makePoint({
    businessDate: '2026-08-11',
    hourLabel: `${pad(hour)}:00`,
    endLabel: `${pad((hour + 1) % 24)}:00`,
    // 08:00 is the only hour thin enough to alert.
    reserve: hour === 8 ? 2135 : 5000,
    required: 1900,
  })
);

const lines = (container: HTMLElement) =>
  [...container.querySelectorAll('.recharts-reference-line line')];

describe('ReserveChart — alert pod linią "teraz"', () => {
  it('draws the alert mark after the now line, so it cannot be painted over', () => {
    const { container } = render(
      <ReserveChart
        data={day}
        orangeThreshold={500}
        redThreshold={300}
        currentHourLabel="08:00"
      />
    );

    const wszystkie = lines(container);
    const teraz = wszystkie.findIndex(
      (l) => l.getAttribute('stroke-dasharray') === null
    );
    const alarm = wszystkie.findIndex(
      (l) => l.getAttribute('stroke-dasharray') === '4 4'
    );

    expect(teraz).toBeGreaterThanOrEqual(0);
    expect(alarm).toBeGreaterThan(teraz);
  });

  it('gives that one mark full strength, since a tint reads as the line beneath', () => {
    const { container } = render(
      <ReserveChart
        data={day}
        orangeThreshold={500}
        redThreshold={300}
        currentHourLabel="08:00"
      />
    );

    const alarm = lines(container).find(
      (l) => l.getAttribute('stroke-dasharray') === '4 4'
    );
    expect(alarm?.getAttribute('stroke-opacity')).toBe('1');
  });

  it('leaves alert hours elsewhere muted, as they were', () => {
    const { container } = render(
      <ReserveChart
        data={day}
        orangeThreshold={500}
        redThreshold={300}
        currentHourLabel="12:00"
      />
    );

    const alarm = lines(container).find(
      (l) => l.getAttribute('stroke-dasharray') === '4 4'
    );
    expect(alarm?.getAttribute('stroke-opacity')).toBe('0.55');
  });
});
