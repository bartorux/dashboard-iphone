import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChartLegend } from '../shared';

describe('ChartLegend', () => {
  it('keeps the info panel mounted and collapsed before anything is opened', () => {
    render(
      <ChartLegend
        items={[{ label: 'Test', swatch: <span />, info: 'Wyjaśnienie.' }]}
      />
    );

    // Same mechanism as SummaryCard's body: the panel has to already be in
    // the DOM, collapsed via data-collapsed, for grid-template-rows to have
    // something to animate open. A bare `{open?.info && ...}` conditional
    // render mounts nothing at all until the "?" is clicked, which is the
    // regression this guards against.
    const panel = document.querySelector('.collapsible');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAttribute('data-collapsed', 'true');
    expect(screen.queryByText('Wyjaśnienie.')).not.toBeInTheDocument();
  });

  it('expands the same collapsible element on click, and collapses it again on a second click', () => {
    render(
      <ChartLegend
        items={[{ label: 'Test', swatch: <span />, info: 'Wyjaśnienie.' }]}
      />
    );

    const button = screen.getByRole('button', { name: 'Co oznacza: Test' });
    fireEvent.click(button);

    const panel = document.querySelector('.collapsible');
    expect(panel).toHaveAttribute('data-collapsed', 'false');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Wyjaśnienie.')).toBeInTheDocument();

    fireEvent.click(button);

    expect(panel).toHaveAttribute('data-collapsed', 'true');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});
