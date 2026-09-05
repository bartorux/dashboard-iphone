import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CompassRows from '../CompassRows';
import { CompassRange } from '../../utils/compass';

function range(level: 2 | 3, from: string, to: string): CompassRange {
  return { level, from, to, hours: 1 };
}

describe('CompassRows', () => {
  it('renders nothing at all for an empty range list — no heading, no rule, no placeholder', () => {
    const { container } = render(<CompassRows ranges={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names the card in full, and separates the two signals in words', () => {
    render(<CompassRows ranges={[range(2, '19:00', '21:00')]} />);
    expect(
      screen.getByText('Kompas Energetyczny PSE')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Prośba operatora do odbiorców — to nie jest przywołanie.')
    ).toBeInTheDocument();
  });

  it('prints the hour range and the operator wording verbatim, with the PSE level as a micro-label', () => {
    render(<CompassRows ranges={[range(2, '19:00', '21:00')]} />);
    expect(screen.getByText('19:00–21:00')).toBeInTheDocument();
    // Straight from COMPASS_WORD, no paraphrase.
    expect(screen.getByText('zalecane oszczędzanie')).toBeInTheDocument();
    expect(screen.getByText('stopień 2')).toBeInTheDocument();
  });

  it('labels level 3 with its own operator wording and its own degree', () => {
    render(<CompassRows ranges={[range(3, '12:00', '14:00')]} />);
    expect(
      screen.getByText('wymagane ograniczenie poboru')
    ).toBeInTheDocument();
    expect(screen.getByText('stopień 3')).toBeInTheDocument();
  });

  it('renders one row per range, in the compass colour, with a leading bar and icon', () => {
    const { container } = render(
      <CompassRows
        ranges={[range(2, '19:00', '21:00'), range(3, '12:00', '14:00')]}
      />
    );
    const rows = container.querySelectorAll('li');
    expect(rows).toHaveLength(2);
    rows.forEach((row) => {
      expect(row.className).toContain('bg-compass-soft');
      expect(row.querySelector('.bg-compass')).not.toBeNull();
      expect(row.querySelector('svg')).not.toBeNull();
    });
  });
});
