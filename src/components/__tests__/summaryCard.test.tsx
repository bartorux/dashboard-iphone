import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SummaryCard from '../SummaryCard';
import { Summary } from '../../hooks/useSummary';

const NOW = new Date('2026-08-09T12:00:00');

const summary: Summary = {
  headline: 'Nie ma podstaw do przywołania.',
  body: 'Rezerwa pokrywa wymaganą wartość.',
  outlook: 'W kolejnych dniach bez zmian.',
  generatedAt: '2026-08-09T09:30:00Z',
  dates: ['2026-08-09', '2026-08-10', '2026-08-11'],
};

describe('SummaryCard', () => {
  beforeEach(() => localStorage.clear());

  it('says a model wrote it and when, and no longer which days', () => {
    render(<SummaryCard summary={summary} now={NOW} />);

    // The span was here because the card covered three days while the tabs
    // covered three of their own, and switching to a day it did not discuss made
    // it read as unrefreshed. The two windows are the same set now, so the span
    // repeated what the tabs already showed. What a reader does check is how old
    // the text is.
    const eyebrow = screen.getByText(/Analiza AI/);
    expect(eyebrow).not.toHaveTextContent('dziś');
    expect(eyebrow).toHaveTextContent(/\d{2}:\d{2}/);
  });

  it('starts expanded', () => {
    render(<SummaryCard summary={summary} now={NOW} />);

    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Rezerwa pokrywa/)).toBeInTheDocument();
  });

  it('keeps the headline when collapsed, because that is the answer', () => {
    render(<SummaryCard summary={summary} now={NOW} />);

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(summary.headline)).toBeInTheDocument();
  });

  it('remembers the choice, which is the only thing that makes it worth having', () => {
    // Held in component state alone it would spring back open on every launch,
    // and someone who wanted less of it would have to say so again each time.
    const { unmount } = render(<SummaryCard summary={summary} now={NOW} />);
    fireEvent.click(screen.getByRole('button'));
    unmount();

    render(<SummaryCard summary={summary} now={NOW} />);

    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });
});
