import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ArkuszTelefon from '../news/telefon/ArkuszTelefon';
import WierszZBranzy from '../news/telefon/WierszZBranzy';
import type { WejscieProps } from '../news/telefon/wspolne';
import type { NewsFile, NewsItem } from '../../utils/newsTypes';

const NOW = new Date('2026-09-17T18:10:00+02:00');

const item = (id: string, title: string, publishedAt: string, source = 'CIRE'): NewsItem => ({
  id,
  title,
  url: `https://x.pl/${id}`,
  source,
  publishedAt,
});

const news: NewsFile = {
  generatedAt: '2026-09-17T16:00:00.000Z',
  groups: [
    {
      id: 'sieci',
      label: 'Sieci',
      items: [
        item('s1', 'Komunikat OSP o zawieszeniu łączenia rynków', '2026-09-17T09:39:00Z', 'PSE'),
        item('s2', 'Harmony Link z decyzją lokalizacyjną', '2026-09-17T06:30:00Z'),
        item('s3', 'Rekompensata za redysponowanie wiatraków', '2026-09-16T08:55:00Z', 'PSE'),
      ],
    },
    { id: 'regulacje', label: 'Regulacje', items: [item('r1', 'Aukcje OZE: harmonogram', '2026-09-17T13:00:00Z', 'URE')] },
    { id: 'energetyka', label: 'Energetyka', items: [item('e1', 'Prawo energetyczne po wecie', '2026-09-17T15:12:00Z')] },
    { id: 'paliwa', label: 'Paliwa i gaz', items: [item('p1', 'Orlen obniża ceny hurtowe', '2026-09-17T15:30:00Z', 'wnp.pl')] },
  ],
};

const never = () => false;

function entry(overrides: Partial<WejscieProps> = {}): WejscieProps {
  return {
    news,
    now: NOW,
    stale: false,
    isNew: never,
    onArticleOpen: vi.fn(),
    onSeen: vi.fn(),
    ...overrides,
  };
}

/**
 * The page behind the sheet: a #root, as index.html has, with the tested tree
 * inside it. The sheet itself renders into <body>, outside it.
 */
function renderInRoot(ui: React.ReactElement) {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
  return { root, ...render(ui, { container: root }) };
}

beforeEach(() => {
  document.body.replaceChildren();
  document.documentElement.style.overflow = '';
});

afterEach(() => {
  delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight;
});

const Harness: React.FC<{ startOpen?: boolean; onClose?: () => void; onArticleOpen?: (id: string) => void }> = ({
  startOpen = false,
  onClose = () => {},
  onArticleOpen = () => {},
}) => {
  const [open, setOpen] = useState(startOpen);
  return (
    <>
      <button type="button" data-z-branzy-otworz onClick={() => setOpen(true)}>
        Otwórz
      </button>
      <ArkuszTelefon
        open={open}
        news={news}
        now={NOW}
        isNew={never}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        onArticleOpen={onArticleOpen}
      />
    </>
  );
};

describe('ArkuszTelefon — the sheet behind the "Z branży" row', () => {
  it('is a labelled modal dialog, outside the page, listing the desktop panel\'s groups', async () => {
    const { root } = renderInRoot(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Otwórz' }));

    const dialog = screen.getByRole('dialog', { name: 'Z branży' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(root.contains(dialog)).toBe(false);
    expect(within(dialog).getByRole('heading', { name: 'Sieci · 3' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /Aukcje OZE/ })).toHaveAttribute('target', '_blank');
  });

  it('renders nothing until it is opened', () => {
    renderInRoot(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('.settings-layer')).toBeNull();
  });

  it('takes the page out of reach while it is open, and gives it back', async () => {
    const { root } = renderInRoot(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Otwórz' }));

    expect(root).toHaveAttribute('inert');
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(document.documentElement.style.overflow).toBe('hidden');

    await userEvent.click(screen.getByRole('button', { name: 'Gotowe' }));

    expect(root).not.toHaveAttribute('inert');
    expect(root).not.toHaveAttribute('aria-hidden');
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('keeps a touch on the sheet or the dim away from pull-to-refresh and the day swipe', async () => {
    renderInRoot(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Otwórz' }));
    const onDocumentTouch = vi.fn();
    const types = ['touchstart', 'touchmove', 'touchend', 'touchcancel'];
    types.forEach((type) => document.addEventListener(type, onDocumentTouch));
    try {
      const list = document.querySelector('.zb-sheet .settings-body') as Element;
      const touch = { touches: [{ clientX: 100, clientY: 300 }], changedTouches: [{ clientX: 100, clientY: 300 }] };
      fireEvent.touchStart(list, touch);
      fireEvent.touchMove(list, touch);
      fireEvent.touchEnd(list, touch);
      fireEvent.touchCancel(list, touch);
      fireEvent.touchStart(document.querySelector('.zb-scrim') as Element, touch);
      expect(onDocumentTouch).not.toHaveBeenCalled();

      // The same listener does hear a touch that is not on the sheet.
      fireEvent.touchStart(document.body, touch);
      expect(onDocumentTouch).toHaveBeenCalledTimes(1);
    } finally {
      types.forEach((type) => document.removeEventListener(type, onDocumentTouch));
    }
  });

  it('gives the page back if it goes while still open — the file aged out, the window widened', async () => {
    const { root, unmount } = renderInRoot(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Otwórz' }));
    expect(root).toHaveAttribute('inert');

    unmount();

    expect(root).not.toHaveAttribute('inert');
    expect(root).not.toHaveAttribute('aria-hidden');
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.querySelector('.settings-layer')).toBeNull();
  });

  it('closes on Gotowe, on Escape and on a tap on the dim', async () => {
    const onClose = vi.fn();
    renderInRoot(<Harness onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Otwórz' });

    await userEvent.click(opener);
    await userEvent.click(screen.getByRole('button', { name: 'Gotowe' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.click(opener);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);

    await userEvent.click(opener);
    fireEvent.click(document.querySelector('.zb-scrim') as Element);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('takes focus when it opens and gives it back to the entry it came from', async () => {
    renderInRoot(<Harness />);
    const opener = screen.getByRole('button', { name: 'Otwórz' });
    await userEvent.click(opener);
    expect(screen.getByRole('dialog')).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: 'Gotowe' }));
    expect(opener).toHaveFocus();
  });

  it('finds the entry by its mark when the tap did not focus it, as in Safari', () => {
    const Controlled: React.FC<{ open: boolean }> = ({ open }) => (
      <>
        <button type="button" data-z-branzy-otworz>
          Otwórz
        </button>
        <ArkuszTelefon open={open} news={news} now={NOW} isNew={never} onClose={() => {}} onArticleOpen={() => {}} />
      </>
    );
    const { rerender } = renderInRoot(<Controlled open={false} />);
    (document.activeElement as HTMLElement | null)?.blur();

    rerender(<Controlled open />);
    rerender(<Controlled open={false} />);

    expect(screen.getByRole('button', { name: 'Otwórz' })).toHaveFocus();
  });

  it('keeps Tab inside the sheet', async () => {
    renderInRoot(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Otwórz' }));
    const dialog = screen.getByRole('dialog');
    const done = screen.getByRole('button', { name: 'Gotowe' });

    done.focus();
    fireEvent.keyDown(done, { key: 'Tab', shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(done);
  });

  it('leaves the page once the way out is over', async () => {
    renderInRoot(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Otwórz' }));
    await userEvent.click(screen.getByRole('button', { name: 'Gotowe' }));

    expect(document.querySelector('.zb-sheet')).toHaveAttribute('data-open', 'false');
    // On its way out it no longer holds the page: a tap goes through at once.
    expect((document.querySelector('.settings-layer') as HTMLElement).style.pointerEvents).toBe('none');
    await waitFor(() => expect(document.querySelector('.settings-layer')).toBeNull());
  });

  it('marks itself open only after its closed position, so the way in is a transition', async () => {
    renderInRoot(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Otwórz' }));

    expect(document.querySelector('.zb-sheet')).toHaveAttribute('data-open', 'true');
    expect(document.querySelector('.zb-scrim')).toHaveAttribute('data-open', 'true');
  });

  it('tells the app when an article is opened, and stays open', async () => {
    const onArticleOpen = vi.fn();
    renderInRoot(<Harness onArticleOpen={onArticleOpen} />);
    await userEvent.click(screen.getByRole('button', { name: 'Otwórz' }));
    await userEvent.click(screen.getByRole('link', { name: /Prawo energetyczne/ }));

    expect(onArticleOpen).toHaveBeenCalledWith('e1');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  describe('drag on the handle', () => {
    beforeEach(() => {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 700 });
    });

    const handle = () => document.querySelector('.zb-sheet .settings-sheet-handle') as Element;
    /** jsdom stamps events with its own clock and drops pointer fields; both are set after creation. */
    const send = (type: 'pointerDown' | 'pointerMove' | 'pointerUp', clientY: number, t: number, pointerType: string) => {
      const event = createEvent[type](handle(), { pointerId: 1, pointerType, clientY });
      Object.defineProperty(event, 'timeStamp', { value: t });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      Object.defineProperty(event, 'pointerType', { value: pointerType });
      Object.defineProperty(event, 'clientY', { value: clientY });
      fireEvent(handle(), event);
    };
    const drag = (to: number, pointerType = 'touch', msPerStep = 40) => {
      let t = 1000;
      send('pointerDown', 20, t, pointerType);
      for (let i = 1; i <= 10; i++) {
        t += msPerStep;
        send('pointerMove', 20 + ((to - 20) * i) / 10, t, pointerType);
      }
      send('pointerUp', to, t + msPerStep, pointerType);
    };

    it('dismisses after a long drag down', async () => {
      const onClose = vi.fn();
      renderInRoot(<Harness onClose={onClose} />);
      await userEvent.click(screen.getByRole('button', { name: 'Otwórz' }));

      act(() => drag(600));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('goes back after a short, slow one, and hands the position back to the stylesheet', async () => {
      const onClose = vi.fn();
      renderInRoot(<Harness onClose={onClose} />);
      await userEvent.click(screen.getByRole('button', { name: 'Otwórz' }));

      act(() => drag(80, 'touch', 200));

      expect(onClose).not.toHaveBeenCalled();
      expect((screen.getByRole('dialog') as HTMLElement).style.transform).toBe('');
    });

    it('leaves a mouse alone, which has Gotowe and Escape', async () => {
      const onClose = vi.fn();
      renderInRoot(<Harness onClose={onClose} />);
      await userEvent.click(screen.getByRole('button', { name: 'Otwórz' }));

      act(() => drag(600, 'mouse'));

      expect(onClose).not.toHaveBeenCalled();
    });
  });
});

describe('WierszZBranzy — the phone\'s "Z branży" row', () => {
  const row = () => screen.getByRole('button', { name: /^Z branży, / });

  it('is a row in the page, named with its state, that opens a dialog', () => {
    const { root } = renderInRoot(<WierszZBranzy {...entry()} />);

    expect(row()).toHaveAccessibleName('Z branży, stan 18:00');
    expect(row()).toHaveAttribute('aria-haspopup', 'dialog');
    expect(root.contains(row())).toBe(true);
    // A row, not an icon: at least 44px tall and the width of the cards.
    expect(row().className).toContain('min-h-11');
    expect(row().className).toContain('w-full');
    expect(row().querySelector('svg')).not.toBeNull();
  });

  it('names PSE and URE when they have something new, and nothing else', () => {
    const cases: Array<[string[], string]> = [
      [['s1'], 'Z branży, nowe od PSE'],
      [['r1'], 'Z branży, nowe od URE'],
      [['r1', 's3'], 'Z branży, nowe od PSE i URE'],
    ];
    for (const [ids, name] of cases) {
      const fresh = new Set(ids);
      const { unmount } = renderInRoot(<WierszZBranzy {...entry({ isNew: (i) => fresh.has(i.id) })} />);
      expect(row()).toHaveAccessibleName(name);
      unmount();
    }
  });

  it('stays at the time of the feeds for new press headlines, even one filed under Sieci', () => {
    const fresh = new Set(['s2', 'e1', 'p1']);
    renderInRoot(<WierszZBranzy {...entry({ isNew: (i) => fresh.has(i.id) })} />);
    expect(row()).toHaveAccessibleName('Z branży, stan 18:00');
  });

  it('says the feeds are old when they are, whatever is new', () => {
    renderInRoot(<WierszZBranzy {...entry({ stale: true, isNew: () => true })} />);
    expect(row()).toHaveAccessibleName('Z branży, stan 18:00, nieaktualne');
    // Old news from PSE is not news: the quiet grey, not the darker one.
    expect(row().querySelectorAll('span')[1].className).toContain('text-text-tertiary');
  });

  it('uses no colour of its own: grey for the time, a darker grey for news from PSE or URE', () => {
    const { unmount } = renderInRoot(<WierszZBranzy {...entry()} />);
    const quiet = row().querySelectorAll('span')[1];
    expect(quiet.className).toContain('text-text-tertiary');
    unmount();

    renderInRoot(<WierszZBranzy {...entry({ isNew: (i) => i.id === 's1' })} />);
    const fresh = row().querySelectorAll('span')[1];
    expect(fresh.className).toContain('text-text-secondary');
    expect(row().outerHTML).not.toMatch(/alarm|warn|accent|ok-/);
  });

  it('opens the sheet, and counts the headlines as seen when it closes, not when it opens', async () => {
    const onSeen = vi.fn();
    renderInRoot(<WierszZBranzy {...entry({ onSeen })} />);

    await userEvent.click(row());
    expect(screen.getByRole('dialog', { name: 'Z branży' })).toBeInTheDocument();
    expect(onSeen).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Gotowe' }));
    expect(onSeen).toHaveBeenCalledTimes(1);
  });
});
