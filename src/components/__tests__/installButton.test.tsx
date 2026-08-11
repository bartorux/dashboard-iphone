import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import InstallButton from '../InstallButton';

const props = {
  isInstalled: false,
  onInstall: vi.fn().mockResolvedValue(undefined),
  onShowInstructions: vi.fn(),
};

describe('InstallButton', () => {
  it('keeps itself off a monitor even when a real install is on offer', () => {
    // The first pass hid only the instructional variants and kept this one,
    // reasoning that a button which does something has earned its place. On the
    // screen this runs on it had not: the offer reappearing on the desktop read
    // as a regression. Chrome still offers the install from its address bar.
    render(<InstallButton {...props} installableState />);

    expect(screen.getByRole('button').className).toContain('xl:hidden');
  });

  it('hides the instructional variants there too', () => {
    render(<InstallButton {...props} installableState="manual" />);
    expect(screen.getByRole('button').className).toContain('xl:hidden');
  });

  it('says nothing at all once the app is installed', () => {
    const { container } = render(<InstallButton {...props} installableState isInstalled />);
    expect(container).toBeEmptyDOMElement();
  });
});
