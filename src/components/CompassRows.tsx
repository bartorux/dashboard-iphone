import React from 'react';
import { COMPASS_WORD, CompassRange } from '../utils/compass';
import { CompassIcon } from './icons';

interface CompassRowsProps {
  ranges: CompassRange[];
}

/**
 * Kompas Energetyczny PSE, inside the Alerty card — but its own component,
 * not a fifth branch of AlertsPanel's already four-way condition. That keeps
 * the panel's alert logic readable and lets this block be rendered and
 * mutation-tested directly, without threading fixtures through the panel.
 *
 * Renders nothing at all when there is nothing to say: a day with no flagged
 * hours must not leave behind an empty heading, a stray rule, or any other
 * trace — see the "no Kompas data" rule this satisfies.
 */
const CompassRows: React.FC<CompassRowsProps> = ({ ranges }) => {
  if (ranges.length === 0) return null;

  return (
    <div className="mt-3 border-t border-separator pt-3">
      <h3 className="text-[0.9375rem] font-semibold text-text">
        Kompas Energetyczny PSE
      </h3>
      {/*
        Always shown while this block exists at all — the one place in the
        app where an alert range and a compass range can sit side by side, so
        the two have to be told apart in words rather than left to the reader
        to sort out from color alone.
      */}
      <p className="mt-0.5 text-[0.6875rem] text-text-tertiary">
        Prośba operatora do odbiorców — to nie jest przywołanie.
      </p>
      <ul className="mt-2 space-y-1.5">
        {ranges.map((range) => (
          <li
            key={`${range.level}-${range.from}`}
            className="flex gap-3 overflow-hidden rounded-xl bg-compass-soft"
          >
            <span className="w-1 shrink-0 bg-compass" aria-hidden />
            <div className="min-w-0 flex-1 py-2 pr-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="tnum text-[0.9375rem] font-semibold text-text">
                  {range.from}–{range.to}
                </span>
                <span className="shrink-0 text-[0.6875rem] text-text-tertiary">
                  stopień {range.level}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-[0.6875rem] font-semibold text-compass">
                <CompassIcon className="h-3.5 w-3.5 shrink-0" />
                {COMPASS_WORD[range.level]}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CompassRows;
