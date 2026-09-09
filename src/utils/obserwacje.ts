import type { Observation, Outcome } from './badanieTypes';

/**
 * The one line the page and the generator agree on: a GitHub issue title.
 *
 * The research page has no backend and must not hold a token, so the owner
 * records what happened by filing an issue from a pre-filled link, and the
 * generator reads the issues back on its next run (every 15 minutes). The title carries the whole
 * observation in a fixed shape; the body is a free note. Anything that does
 * not parse is ignored, never guessed at — an issue is a conversation, and
 * only its title is data.
 *
 *   [badanie] 2026-09-07 nic
 *   [badanie] 2026-09-07 20:00 test jednostka
 *   [badanie] 2026-09-07 20:00 przywolanie rynek
 */
export const ISSUE_PREFIX = '[badanie]';

const OUTCOME_WORD: Record<Exclude<Outcome, 'none'>, string> = {
  test: 'test',
  real: 'przywolanie',
};
const SCOPE_WORD = { unit: 'jednostka', market: 'rynek' } as const;

export interface ObservationDraft {
  date: string;
  outcome: Outcome;
  hour?: number;
  scope?: 'unit' | 'market';
}

export function formatObservationTitle(draft: ObservationDraft): string {
  if (draft.outcome === 'none') return `${ISSUE_PREFIX} ${draft.date} nic`;
  const hour = String(draft.hour ?? 0).padStart(2, '0');
  const scope = SCOPE_WORD[draft.scope ?? 'unit'];
  return `${ISSUE_PREFIX} ${draft.date} ${hour}:00 ${OUTCOME_WORD[draft.outcome]} ${scope}`;
}

const TITLE = new RegExp(
  `^\\[badanie\\]\\s+(\\d{4}-\\d{2}-\\d{2})\\s+(?:(nic)|(\\d{2}):00\\s+(test|przywolanie)\\s+(jednostka|rynek))\\s*$`,
  'i'
);

/** Parses a title back; null for anything that is not exactly the shape above. */
export function parseObservationTitle(title: string): ObservationDraft | null {
  const m = TITLE.exec(title.trim());
  if (!m) return null;
  const date = m[1];
  if (m[2]) return { date, outcome: 'none' };
  const hour = Number(m[3]);
  if (hour > 23) return null;
  const outcome: Outcome = m[4].toLowerCase() === 'test' ? 'test' : 'real';
  const scope = m[5].toLowerCase() === 'rynek' ? 'market' : 'unit';
  return { date, outcome, hour, scope };
}

/** The minimum of a GitHub issue this module reads. */
export interface IssueLike {
  number: number;
  title: string;
  body?: string | null;
}

/** Issues → observations; unparseable titles dropped, later issue for the same date wins. */
export function observationsFromIssues(issues: IssueLike[]): Observation[] {
  const byDate = new Map<string, Observation>();
  const ordered = [...issues].sort((a, b) => a.number - b.number);
  for (const issue of ordered) {
    const draft = parseObservationTitle(issue.title);
    if (!draft) continue;
    const note = issue.body?.trim();
    byDate.set(draft.date, {
      ...draft,
      ...(note ? { note } : {}),
      source: 'issue',
      issueNumber: issue.number,
    });
  }
  return [...byDate.values()];
}

/** Pre-filled "new issue" link the page opens; the owner only presses Submit. */
export function issueUrlFor(repo: string, draft: ObservationDraft, note: string): string {
  const params = new URLSearchParams({ title: formatObservationTitle(draft), body: note });
  return `https://github.com/${repo}/issues/new?${params.toString()}`;
}
