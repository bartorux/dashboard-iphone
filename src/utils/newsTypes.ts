/**
 * public/news.json — industry headlines for the "Z branży" card and panel.
 *
 * Written by scripts/news.ts from RSS and Atom feeds the browser cannot read
 * itself (almost none of them send CORS headers). Titles, sources, times and
 * links only: no leads, no images — what a link to someone else's article can
 * carry without republishing it.
 */

export type NewsGroupId = 'sieci' | 'regulacje' | 'energetyka' | 'paliwa';

export interface NewsItem {
  /** Stable across runs: derived from the article URL, so "read" survives a refetch. */
  id: string;
  title: string;
  /** https only; anything else is dropped at the source and again on read. */
  url: string;
  /** Display name of the outlet, e.g. "PSE", "Wysokie Napięcie". */
  source: string;
  /** ISO 8601, UTC. */
  publishedAt: string;
}

export interface NewsGroup {
  id: NewsGroupId;
  label: string;
  /** Newest first. */
  items: NewsItem[];
}

export interface NewsFile {
  /** When the feeds were read — "stan HH:MM" on the card. */
  generatedAt: string;
  /** Always in reading order: Sieci, Regulacje, Energetyka, Paliwa i gaz. */
  groups: NewsGroup[];
}
