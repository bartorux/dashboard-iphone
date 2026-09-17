import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LayoutSection from '../settings/LayoutSection';
import Switch from '../Switch';
import { CARDS, DEFAULT_LAYOUT, Layout, toggleCard } from '../../utils/layout';

const props = (layout: Layout = DEFAULT_LAYOUT) => ({
  layout,
  onToggleCard: vi.fn(),
  onChartChange: vi.fn(),
  onReset: vi.fn(),
});

describe('Switch', () => {
  it('is a switch that says which way it is set', async () => {
    const onChange = vi.fn();
    render(<Switch checked onChange={onChange} label="Miks OZE" />);
    const control = screen.getByRole('switch', { name: 'Miks OZE' });
    expect(control).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('answers the keyboard, as a button does', async () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Trendy" />);
    screen.getByRole('switch').focus();
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('LayoutSection', () => {
  it('lists every card with a switch, and the chart column as text', () => {
    render(<LayoutSection {...props()} />);
    for (const card of CARDS) {
      expect(screen.getByRole('switch', { name: card.label })).toHaveAttribute('aria-checked', 'true');
    }
    expect(screen.getByText('Dni, wykres i alerty')).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /Dni, wykres/ })).toBeNull();
  });

  it('shows a hidden card as switched off', () => {
    render(<LayoutSection {...props(toggleCard(DEFAULT_LAYOUT, 'news'))} />);
    expect(screen.getByRole('switch', { name: 'Z branży' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: 'Miks OZE' })).toHaveAttribute('aria-checked', 'true');
  });

  it('asks for the card to be toggled and says what happened', async () => {
    const p = props();
    render(<LayoutSection {...p} />);
    await userEvent.click(screen.getByRole('switch', { name: 'Analiza i trendy' }));
    expect(p.onToggleCard).toHaveBeenCalledWith('trends');
    expect(screen.getByText('Analiza i trendy ukryta.')).toBeInTheDocument();
  });

  it('offers the three chart sizes and reports the choice', async () => {
    const p = props();
    render(<LayoutSection {...p} />);
    const group = screen.getByRole('radiogroup', { name: 'Wysokość wykresu' });
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual([
      'Kompaktowy',
      'Standardowy',
      'Wysoki',
    ]);
    await userEvent.click(within(group).getByRole('radio', { name: 'Wysoki' }));
    expect(p.onChartChange).toHaveBeenCalledWith('tall');
    expect(screen.getByText('Wykres wysoki.')).toBeInTheDocument();
  });

  /* The region has to be in the tree before it has anything to say — see the
     same shape, and the same reason, on the threshold error above it. */
  it('keeps one live region, present and empty at rest', () => {
    const { container } = render(<LayoutSection {...props()} />);
    const regions = container.querySelectorAll('[aria-live="polite"]');
    expect(regions).toHaveLength(1);
    expect(regions[0].textContent).toBe('');
  });

  it('restores the defaults, and offers that only when there is something to restore', async () => {
    const p = props();
    const { rerender } = render(<LayoutSection {...p} />);
    expect(screen.getByRole('button', { name: 'Przywróć układ' })).toBeDisabled();

    rerender(<LayoutSection {...props(toggleCard(DEFAULT_LAYOUT, 'mix'))} onReset={p.onReset} />);
    const reset = screen.getByRole('button', { name: 'Przywróć układ' });
    expect(reset).toBeEnabled();
    await userEvent.click(reset);
    expect(p.onReset).toHaveBeenCalled();
  });

  it('says what hiding the news card costs, and where the layout is kept', () => {
    render(<LayoutSection {...props()} />);
    expect(screen.getByText(/usuwa też jedyne wejście do panelu wiadomości/)).toBeInTheDocument();
    expect(screen.getByText(/zapisuje się w tej przeglądarce/)).toBeInTheDocument();
  });

  it('hides itself below 80rem and keeps the preview out of the accessibility tree', () => {
    const { container } = render(<LayoutSection {...props()} />);
    expect(container.firstElementChild).toHaveClass('hidden', 'xl:block');
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
