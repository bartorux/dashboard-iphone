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

  it('says which days it covers and that a model wrote it', () => {
    render(<SummaryCard summary={summary} now={NOW} />);

    // Without the span the card reads as merely unrefreshed once the day tabs
    // are switched and it does not follow them.
    expect(screen.getByText(/Analiza AI/)).toHaveTextContent('dziś–pojutrze');
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
