import React from 'react';
import { usePersistentFlag } from '../../hooks/usePersistentFlag';
import { ChevronDownIcon } from '../icons';

export interface HourColumn<Row> {
  /** Column heading, and the React key. */
  header: string;
  /** Already formatted — the table does no arithmetic and no unit guessing. */
  value: (row: Row) => string;
  /** Text-tone class for the cell, e.g. `text-alarm-text`. */
  tone?: (row: Row) => string;
  /** The hour column reads left; every column of figures reads right. */
  align?: 'left' | 'right';
}

interface HourTableProps<Row> {
  rows: Row[];
  columns: HourColumn<Row>[];
  /** Key for the row, e.g. the hour label. */
  rowKey: (row: Row) => string;
  /**
   * Storage suffix for the open/closed choice. Per view, not per app: someone
   * who reads the reserve figures as a table does not necessarily want the
   * generation table open too.
   */
  storageKey: string;
  /** Named in the trigger, so a collapsed section says what it holds. */
  label?: string;
}

/**
 * The 24 hours behind the chart, as figures.
 *
 * A chart is a shape; the shape is what this app is for. But three questions it
 * cannot answer — what exactly was the 19:00 value, what is the difference
 * between two named hours, and what do I paste into an email — are the ones
 * asked most often about a forecast, and until now the only way to get any of
 * them was to hover 24 times.
 *
 * Visible to everyone rather than `sr-only`. A table hidden from sighted
 * readers is not an accessibility feature, it is the same content withheld from
 * most of the people who want it; and a `sr-only` table cannot be selected,
 * copied or read on a phone that is not running VoiceOver. Collapsed by
 * default, so the page is exactly as long as it was for anyone who does not
 * want it.
 *
 * One component driven by a column spec, not three tables. The three views
 * share an hour axis and differ only in which figures hang off it, and three
 * copies of a table is how three tables come to format their numbers three
 * different ways.
 *
 * The chevron, the 300ms curve and `usePersistentFlag` are lifted verbatim from
 * SummaryCard and TrendsSection. A third disclosure on one screen that opened
 * at a different speed, or forgot its state when the app was reopened, would be
 * a third dialect of a control the reader has already learned twice.
 */
function HourTable<Row>({
  rows,
  columns,
  rowKey,
  storageKey,
  label = 'Tabela godzinowa',
}: HourTableProps<Row>) {
  const [expanded, setExpanded] = usePersistentFlag(storageKey, false);

  if (rows.length === 0) return null;

  return (
    <div className="mt-2 border-t border-separator pt-1">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex min-h-11 w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-[0.75rem] text-text-secondary">{label}</span>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            expanded ? '' : '-rotate-90'
          }`}
        />
      </button>

      <div className="collapsible" data-collapsed={!expanded}>
        <div>
          {/* Wide tables scroll inside their own box; the page never scrolls
              sideways. On a phone five columns of megawatts do not fit, and
              shrinking the type until they do would make the figures unreadable
              at exactly the moment someone asked for figures. */}
          <div className="overflow-x-auto pb-2">
            <table className="w-full min-w-full border-collapse text-[0.75rem]">
              <thead>
                <tr>
                  {columns.map((column, index) => (
                    <th
                      key={column.header}
                      scope="col"
                      className={`whitespace-nowrap border-b border-separator py-1.5 font-medium text-text-tertiary ${
                        (column.align ?? (index === 0 ? 'left' : 'right')) === 'left'
                          ? 'pr-3 text-left'
                          : 'pl-3 text-right'
                      }`}
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={rowKey(row)}>
                    {columns.map((column, index) => {
                      const align = column.align ?? (index === 0 ? 'left' : 'right');
                      return (
                        <td
                          key={column.header}
                          className={`whitespace-nowrap border-b border-separator py-1 ${
                            /* tnum here is the textbook case rather than the
                               habit: a column of figures that must line up
                               vertically. The hero figure on the status card
                               deliberately does not use it. */
                            align === 'left'
                              ? 'tnum pr-3 text-left text-text-secondary'
                              : `tnum pl-3 text-right font-medium ${
                                  column.tone?.(row) ?? 'text-text'
                                }`
                          }`}
                        >
                          {column.value(row)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HourTable;
