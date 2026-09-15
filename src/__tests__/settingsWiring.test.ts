import { describe, it, expect } from 'vitest';
import app from '../App.tsx?raw';
import pkg from '../../package.json';

/**
 * Source-level, like refreshButtonWiring.test.ts: App has no render harness.
 * What SettingsPanel does with these props is tested on the component itself.
 */
describe('settings wiring in App', () => {
  it('shows the version from package.json, not a copy of it', () => {
    expect(app).toContain("import { version as appVersion } from '../package.json';");
    expect(app).toContain('version={appVersion}');
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('opens from the header gear and closes through one callback', () => {
    expect(app).toContain('onToggleSettings={() => setSettingsVisible((visible) => !visible)}');
    expect(app).toContain('open={settingsVisible}');
    expect(app).toContain('onClose={closeSettings}');
  });

  it('moves the install offer into the settings, leaving the refresh button at the foot of the page', () => {
    expect(app).not.toContain('<InstallButton');
    expect(app).toContain('installableState={installableState}');
    expect(app).toContain('onInstall={install}');
    expect(app).toMatch(/\{showRefreshButton && \(\s*<button/);
  });

  it('hands the panel the same margin the status card shows', () => {
    expect(app).toMatch(
      /const currentMargin =\s*currentPoint && currentPoint\.reserve !== null && currentPoint\.required !== null\s*\? currentPoint\.reserve - currentPoint\.required/
    );
    expect(app).toContain('currentMargin={currentMargin}');
  });
});
