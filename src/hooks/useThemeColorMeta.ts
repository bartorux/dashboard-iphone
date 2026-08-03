import { useEffect } from 'react';
import { SystemStatus } from '../types';
import { STATUS_THEME_COLOR } from '../utils/status';

/**
 * Keep <meta name="theme-color"> in sync with the current status so the browser
 * chrome matches the header.
 *
 * Note for installed iOS home-screen apps: the status bar style is captured at
 * install time, so an already-installed instance may keep the colour it was
 * added with. The UI must not depend on this taking effect.
 */
export function useThemeColorMeta(status: SystemStatus): void {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    );
    if (meta) meta.content = STATUS_THEME_COLOR[status];
  }, [status]);
}
