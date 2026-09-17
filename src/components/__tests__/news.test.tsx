import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewsCard from '../news/NewsCard';
import NewsSheet from '../news/NewsSheet';
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
    { id: 'paliwa', label: 'Paliwa i gaz', items: [] },
  ],
};

const never = () => false;
const always = () => true;

describe('NewsCard', () => {
  it('laptop: two rows — the newest of all and the newest from Sieci — with source and time', () => {
    render(<NewsCard news={news} now={NOW} variant="laptop" stale={false} isNew={never} activeId={null} onOpen={() => {}} />);
    const rows = screen.getAllByRole('button', { expanded: undefined }).filter((node) => node.dataset.newsRow);
    expect(rows.map((row) => row.dataset.newsRow)).toEqual(['e1', 's1']);
    expect(within(rows[1]).getByText(/PSE/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/11:39/)).toBeInTheDocument();
  });

  it('monitor: one row per group, each named, and an empty group left out', () => {
    render(<NewsCard news={news} now={NOW} variant="monitor" stale={false} isNew={never} activeId={null} onOpen={() => {}} />);
    const rows = screen.getAllByRole('button').filter((node) => node.dataset.newsRow);
    expect(rows.map((row) => row.dataset.newsRow)).toEqual(['s1', 'r1', 'e1']);
    expect(within(rows[0]).getByText('Sieci')).toBeInTheDocument();
    expect(screen.queryByText('Paliwa i gaz')).not.toBeInTheDocument();
  });

  it('says when it was read and counts what is new', () => {
    const { rerender } = render(
      <NewsCard news={news} now={NOW} variant="laptop" stale={false} isNew={never} activeId={null} onOpen={() => {}} />
    );
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Z branży · stan 18:00');

    rerender(<NewsCard news={news} now={NOW} variant="laptop" stale={false} isNew={always} activeId={null} onOpen={() => {}} />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Z branży · stan 18:00 · 5 nowe');
  });

  it('says "nieaktualne" instead of a count when the feeds stopped coming', () => {
    render(<NewsCard news={news} now={NOW} variant="laptop" stale isNew={always} activeId={null} onOpen={() => {}} />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Z branży · stan 18:00, nieaktualne');
  });

  it('a row asks for the panel with its own headline; "Wszystkie" asks for the top', async () => {
    const onOpen = vi.fn();
    render(<NewsCard news={news} now={NOW} variant="laptop" stale={false} isNew={never} activeId={null} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: /Prawo energetyczne/ }));
    expect(onOpen).toHaveBeenLastCalledWith('e1');
    await userEvent.click(screen.getByRole('button', { name: 'Wszystkie ›' }));
    expect(onOpen).toHaveBeenLastCalledWith(null);
  });

  it('keeps the row the open panel came from lit', () => {
    render(<NewsCard news={news} now={NOW} variant="laptop" stale={false} isNew={never} activeId="s1" onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: /Komunikat OSP/ }).dataset.active).toBe('true');
    expect(screen.getByRole('button', { name: /Prawo energetyczne/ }).dataset.active).toBe('false');
  });
});

describe('NewsSheet', () => {
  beforeEach(() => document.body.replaceChildren(document.createElement('main')));

  const Harness: React.FC<{ startOpen?: boolean; highlightId?: string | null; onArticleOpen?: (id: string) => void }> = ({
    startOpen = true,
    highlightId = null,
    onArticleOpen = () => {},
  }) => {
    const [open, setOpen] = useState(startOpen);
    return (
      <>
        <button type="button" data-news-all onClick={() => setOpen(true)}>
          Wszystkie ›
        </button>
        <NewsSheet
          open={open}
          news={news}
          now={NOW}
          isNew={never}
          highlightId={highlightId}
          onClose={() => setOpen(false)}
          onArticleOpen={onArticleOpen}
        />
      </>
    );
  };

  it('lists every group with its count, and the sources it drew on', () => {
    render(<Harness />);
    const panel = screen.getByRole('dialog');
    expect(within(panel).getByRole('heading', { name: 'Z branży' })).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'Sieci · 3' })).toBeInTheDocument();
    expect(within(panel).queryByRole('heading', { name: /Paliwa/ })).not.toBeInTheDocument();
    expect(within(panel).getByText(/Źródła: PSE, CIRE, URE · pobrano 18:00/)).toBeInTheDocument();
  });

  it('every headline is a link that opens in a new tab, and says so', () => {
    render(<Harness />);
    const link = screen.getByRole('link', { name: /Komunikat OSP/ });
    expect(link).toHaveAttribute('href', 'https://x.pl/s1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(link).getByText('(otwiera nową kartę)')).toBeInTheDocument();
  });

  it('shows two headlines per group and the rest behind "Wszystkie", one group at a time', async () => {
    render(<Harness />);
    const rest = document.getElementById(screen.getByRole('button', { name: 'Wszystkie (3)' }).getAttribute('aria-controls')!);
    expect(rest?.dataset.collapsed).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Wszystkie (3)' }));
    expect(rest?.dataset.collapsed).toBe('false');
    await userEvent.click(screen.getByRole('button', { name: 'Mniej' }));
    expect(rest?.dataset.collapsed).toBe('true');
  });

  it('lights the headline the card pointed at', () => {
    render(<Harness highlightId="s1" />);
    expect(screen.getByRole('link', { name: /Komunikat OSP/ }).dataset.hit).toBe('true');
    expect(screen.getByRole('link', { name: /Harmony Link/ }).dataset.hit).toBe('false');
  });

  it('tells the app when an article is opened, and stays open itself', async () => {
    const onArticleOpen = vi.fn();
    render(<Harness onArticleOpen={onArticleOpen} />);
    await userEvent.click(screen.getByRole('link', { name: /Aukcje OZE/ }));
    expect(onArticleOpen).toHaveBeenCalledWith('r1');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('takes the dashboard out of reach while it is open, and gives it back', async () => {
    render(<Harness />);
    expect(document.querySelector('main')).toHaveAttribute('inert');
    await userEvent.click(screen.getByRole('button', { name: 'Gotowe' }));
    expect(document.querySelector('main')).not.toHaveAttribute('inert');
  });

  it('closes on Escape and on a click on the dim', async () => {
    const { unmount } = render(<Harness />);
    await userEvent.keyboard('{Escape}');
    expect(document.querySelector('main')).not.toHaveAttribute('inert');
    unmount();

    render(<Harness />);
    await userEvent.click(document.querySelector('.news-scrim')!);
    expect(document.querySelector('main')).not.toHaveAttribute('inert');
  });

  it('gives focus to the panel, and hands it back to the card when it closes', async () => {
    render(<Harness startOpen={false} />);
    const opener = screen.getByRole('button', { name: 'Wszystkie ›' });
    await userEvent.click(opener);
    expect(screen.getByRole('dialog')).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Gotowe' }));
    expect(opener).toHaveFocus();
  });

  it('renders nothing at all when it has never been opened', () => {
    render(<Harness startOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
