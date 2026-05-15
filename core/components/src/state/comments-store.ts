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
