import { useCallback, useState } from 'react';
import { STORAGE_PREFIX } from '../utils/constants';
import type { NewsItem } from '../utils/newsTypes';

const KEY = `${STORAGE_PREFIX}news-seen`;
/** Enough for a fortnight of every headline the file can hold; the oldest fall off first. */
const MAX_READ_IDS = 300;

interface SeenState {
  /** Headlines published after this are "nowe". */
  seenAt: string;
  /** Opened articles — not new any more, whenever they were published. */
  readIds: string[];
}

function load(now: Date): SeenState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SeenState> | null;
    if (raw && typeof raw.seenAt === 'string' && !Number.isNaN(Date.parse(raw.seenAt))) {
      return {
        seenAt: raw.seenAt,
        readIds: Array.isArray(raw.readIds) ? raw.readIds.filter((id): id is string => typeof id === 'string') : [],
      };
    }
  } catch {
    // Unreadable or unavailable: start from now, below.
  }
  // A first visit starts with nothing new. "8 nowe" on a card nobody has seen
  // before would say nothing about what changed since last time.
  const fresh = { seenAt: now.toISOString(), readIds: [] };
  save(fresh);
  return fresh;
}

function save(state: SeenState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private browsing or a full quota: "nowe" then lasts only this session.
  }
}

/**
 * Which headlines are new since the reader last looked.
 *
 * "Looked" means closed the panel, not merely had the page open: the card
 * sits in view all day, and seeing two titles in it is not reading the list.
 * An opened article is read at once, whenever the panel closes.
 */
export function useNewsSeen(): {
  isNew: (item: NewsItem) => boolean;
  markRead: (id: string) => void;
  markSeen: () => void;
} {
  const [state, setState] = useState<SeenState>(() => load(new Date()));

  const isNew = useCallback(
    (item: NewsItem) => Date.parse(item.publishedAt) > Date.parse(state.seenAt) && !state.readIds.includes(item.id),
    [state]
  );

  const markRead = useCallback((id: string) => {
    setState((current) => {
      if (current.readIds.includes(id)) return current;
      const next = { ...current, readIds: [...current.readIds, id].slice(-MAX_READ_IDS) };
      save(next);
      return next;
    });
  }, []);

  const markSeen = useCallback(() => {
    setState((current) => {
      const next = { ...current, seenAt: new Date().toISOString() };
      save(next);
      return next;
    });
  }, []);

  return { isNew, markRead, markSeen };
}
