import { Signal } from 'signal-polyfill';
import type { CommentThread } from '@design-bridge/protocol';

/**
 * Signal store for comment threads.
 *
 * Read:   commentsSignal.get()
 * Update: updateComments(list) — called by the WS adapter (comments:sync)
 *         and by inspector.ts on local mutations.
 */
export const commentsSignal = new Signal.State<CommentThread[]>([]);

export function updateComments(comments: CommentThread[]): void {
  commentsSignal.set(comments);
}

/**
 * Signal store for orphaned comment IDs — comments whose CSS selector no
 * longer matches any DOM element. Updated by db-comment on each reposition.
 */
export const orphanedIdsSignal = new Signal.State<Set<string>>(new Set());

export function markOrphaned(id: string): void {
  const prev = orphanedIdsSignal.get();
  if (prev.has(id)) return;
  const next = new Set(prev);
  next.add(id);
  orphanedIdsSignal.set(next);
}

export function markUnorphaned(id: string): void {
  const prev = orphanedIdsSignal.get();
  if (!prev.has(id)) return;
  const next = new Set(prev);
  next.delete(id);
  orphanedIdsSignal.set(next);
}
