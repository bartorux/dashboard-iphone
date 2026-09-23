import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ArkuszTelefon from '../news/eksperyment/ArkuszTelefon';
import PasekIkona from '../news/eksperyment/PasekIkona';
import PasekDolny from '../news/eksperyment/PasekDolny';
import SekcjaGora from '../news/eksperyment/SekcjaGora';
import { newLabel, type WejscieProps } from '../news/eksperyment/wspolne';
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

describe('ArkuszTelefon — the sheet behind "pasek" and "dol"', () => {
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

describe('PasekIkona — "pasek"', () => {
  it('is an icon button named "Z branży" that opens the sheet', async () => {
    renderInRoot(<PasekIkona {...entry()} />);
    const button = screen.getByRole('button', { name: 'Z branży' });
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden');

    await userEvent.click(button);

    expect(screen.getByRole('dialog', { name: 'Z branży' })).toBeInTheDocument();
  });

  it('counts the headlines as seen when the sheet is closed, not when it opens', async () => {
    const onSeen = vi.fn();
    renderInRoot(<PasekIkona {...entry({ onSeen })} />);

    await userEvent.click(screen.getByRole('button', { name: 'Z branży' }));
    expect(onSeen).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Gotowe' }));
    expect(onSeen).toHaveBeenCalledTimes(1);
  });
});

describe('PasekDolny — "dol"', () => {
  const bar = () => document.querySelector('.zb-bar') as HTMLElement;

  it('is fixed to the foot of the screen, outside the page, with room left for it at the foot of the page', () => {
    const { root } = renderInRoot(<PasekDolny {...entry()} />);

    expect(bar().className).toContain('fixed');
    expect(bar().className).toContain('bottom-0');
    expect(root.contains(bar())).toBe(false);
    // The safe-area padding under it is not checked here: jsdom drops env() values.

    const room = root.querySelector('[data-z-branzy-odstep]') as HTMLElement;
    expect(room).toHaveAttribute('aria-hidden');
    // The same 48px as the bar's button, which is its height above the safe area.
    expect(room.className).toContain('h-12');
    expect(within(bar()).getByRole('button').className).toContain('h-12');
  });

  it('says how many headlines are new', () => {
    const fresh = new Set(['s1', 'r1', 'e1']);
    renderInRoot(<PasekDolny {...entry({ isNew: (i) => fresh.has(i.id) })} />);
    expect(within(bar()).getByRole('button').textContent).toBe('Z branży · 3 nowe');
  });

  it('says when the feeds were read when nothing is new, and that they are old when they are', () => {
    const { unmount } = renderInRoot(<PasekDolny {...entry()} />);
    expect(within(bar()).getByRole('button').textContent).toBe('Z branży · stan 18:00');
    unmount();

    renderInRoot(<PasekDolny {...entry({ stale: true, isNew: () => true })} />);
    expect(within(bar()).getByRole('button').textContent).toBe('Z branży · stan 18:00, nieaktualne');
  });

  it('opens the sheet, and counts the headlines as seen when it closes', async () => {
    const onSeen = vi.fn();
    renderInRoot(<PasekDolny {...entry({ onSeen })} />);

    await userEvent.click(within(bar()).getByRole('button'));
    expect(screen.getByRole('dialog', { name: 'Z branży' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Gotowe' }));
    expect(onSeen).toHaveBeenCalledTimes(1);
  });

  it('takes its bar with it when it goes', () => {
    const { unmount } = renderInRoot(<PasekDolny {...entry()} />);
    unmount();
    expect(document.querySelector('.zb-bar')).toBeNull();
  });
});

describe('SekcjaGora — "gora"', () => {
  const section = () => document.querySelector('[data-z-branzy-sekcja]') as HTMLElement;

  it('lists three headlines: PSE and URE first, then the newest, one from Paliwa at most', () => {
    renderInRoot(<SekcjaGora {...entry()} />);
    const links = within(section()).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['https://x.pl/r1', 'https://x.pl/s1', 'https://x.pl/p1']);
  });

  it('each row is the article itself, in a new tab, with its group, source and time', () => {
    renderInRoot(<SekcjaGora {...entry()} />);
    const link = within(section()).getByRole('link', { name: /Komunikat OSP/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link.textContent).toContain('Sieci·PSE·11:39');
    expect(within(link).getByText('(otwiera nową kartę)')).toBeInTheDocument();
    expect(within(section()).queryByRole('button')).toBeNull();
  });

  it('names itself like the desktop card, with the count in words', () => {
    const { unmount } = renderInRoot(<SekcjaGora {...entry({ isNew: (i) => i.id === 'r1' })} />);
    expect(within(section()).getByRole('heading', { level: 2 }).textContent).toBe('Z branży · stan 18:00 · 1 nowa');
    unmount();

    renderInRoot(<SekcjaGora {...entry({ stale: true, isNew: () => true })} />);
    expect(within(section()).getByRole('heading', { level: 2 }).textContent).toBe('Z branży · stan 18:00, nieaktualne');
  });

  it('tells the app when an article is opened', async () => {
    const onArticleOpen = vi.fn();
    renderInRoot(<SekcjaGora {...entry({ onArticleOpen })} />);
    await userEvent.click(within(section()).getByRole('link', { name: /Aukcje OZE/ }));
    expect(onArticleOpen).toHaveBeenCalledWith('r1');
  });

  it('counts the headlines as seen when the page is left, not while it is in view', () => {
    const onSeen = vi.fn();
    renderInRoot(<SekcjaGora {...entry({ onSeen })} />);
    const hidden = vi.spyOn(document, 'hidden', 'get');

    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onSeen).not.toHaveBeenCalled();

    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onSeen).toHaveBeenCalledTimes(1);
    hidden.mockRestore();
  });
});

describe('newLabel', () => {
  it('agrees the word with the number, and stops counting past nine', () => {
    expect(newLabel(1)).toBe('1 nowa');
    expect(newLabel(2)).toBe('2 nowe');
    expect(newLabel(4)).toBe('4 nowe');
    expect(newLabel(5)).toBe('5 nowych');
    expect(newLabel(9)).toBe('9 nowych');
    expect(newLabel(10)).toBe('9+ nowych');
  });
});
