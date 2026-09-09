import { describe, it, expect } from 'vitest';
import dayNavigation from '../components/DayNavigation.tsx?raw';
import chartSection from '../components/ChartSection.tsx?raw';
import appCss from '../App.css?raw';

/**
 * The day tabs and the view switcher are capped at 34rem, never fixed at it.
 *
 * With the third column arriving at 96rem the chart column at 1536px is
 * narrower than 34rem, and a fixed width overflowed into the margin card
 * (seen 09.09.2026). Source-level, like compassIsolation.test.ts: the class
 * string is the contract, and a render test would need the 1536px layout that
 * only the visual guard ("laptop-light") actually exercises.
 */
describe('tabs shrink with the column', () => {
  it.each([
    ['DayNavigation', dayNavigation],
    ['ChartSection', chartSection],
  ])('%s caps the control at 34rem instead of fixing it', (_name, source) => {
    expect(source).toContain('xl:w-full xl:max-w-[34rem]');
    expect(source).not.toContain('xl:w-[34rem]');
  });

  it('the third column starts at 110rem — 24-inch monitors and up, by the owner\'s decision', () => {
    // A 96rem trial (09.09.2026) put three columns on a 14-inch screen and was
    // rejected: "od 24 cali w górę". The number is a decision, so it is pinned.
    expect(appCss).toContain('@media (min-width: 110rem) {\n  .content-width {\n    max-width: 120rem;');
    expect(appCss).not.toContain('min-width: 96rem) {\n  .content-width {\n    max-width: 120rem');
  });
});
