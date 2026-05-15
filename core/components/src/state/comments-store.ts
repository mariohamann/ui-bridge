import { Signal } from 'signal-polyfill';
import type { Comment } from '@design-bridge/protocol';

/**
 * Signal store for comments.
 *
 * Read:   commentsSignal.get()
 * Update: updateComments(list) — called by the WS adapter (comments:sync)
 *         and by inspector.ts on local mutations.
 */
export const commentsSignal = new Signal.State<Comment[]>([]);

export function updateComments(comments: Comment[]): void {
  commentsSignal.set(comments);
}
