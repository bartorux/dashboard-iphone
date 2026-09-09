import { describe, it, expect } from 'vitest';
import app from '../App.tsx?raw';
import main from '../main.tsx?raw';

/**
 * Source-level, like compassIsolation.test.ts: App has no render harness.
 * The page's refresh button is gated on useRefreshButton (hidden in a plain
 * desktop browser); the error screen's button in main.tsx is NOT — there it is
 * the only thing that still works, on every device.
 */
describe('refresh button wiring', () => {
  it('gates the page button on useRefreshButton', () => {
    expect(app).toContain("import { useRefreshButton } from './hooks/useRefreshButton';");
    expect(app).toMatch(/\{showRefreshButton && \(\s*<button/);
  });

  it('never gates the error screen button', () => {
    expect(main).not.toContain('useRefreshButton');
    expect(main).toContain('Odśwież stronę');
  });
});
