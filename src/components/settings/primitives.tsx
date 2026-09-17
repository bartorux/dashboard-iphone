import React from 'react';

/**
 * The three pieces every settings section is built from, shared so a second
 * section (see LayoutSection) is the same list rather than a lookalike.
 */

/** `first` sits right under the title bar, which already supplies the space above. */
export const SectionHeader: React.FC<{ id?: string; first?: boolean; children: React.ReactNode }> = ({
  id,
  first,
  children,
}) => (
  <h3
    id={id}
    className={`px-8 pb-1.5 ${first ? 'pt-2' : 'pt-6'} text-[0.8125rem] font-normal uppercase tracking-[0.02em] text-text-secondary`}
  >
    {children}
  </h3>
);

export const SectionFooter: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="px-8 pt-1.5 text-[0.8125rem] leading-snug text-text-secondary">{children}</p>
);

/** iOS inset-grouped list: rounded cells, hairlines inset from the leading edge (see .sheet-group). */
export const Group: React.FC<{ children: React.ReactNode; labelledBy?: string }> = ({ children, labelledBy }) => (
  <div
    role={labelledBy ? 'group' : undefined}
    aria-labelledby={labelledBy}
    className="sheet-group mx-4 overflow-hidden rounded-xl bg-sheet-cell"
  >
    {children}
  </div>
);
