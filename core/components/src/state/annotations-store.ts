import { Signal } from 'signal-polyfill';
import type { Annotation } from '@design-bridge/protocol';

/**
 * Signal store for annotations.
 *
 * Read:   annotationsSignal.get()
 * Update: updateAnnotations(list) — called by the WS adapter (annotations:sync)
 *         and by inspector.ts on local mutations.
 */
export const annotationsSignal = new Signal.State<Annotation[]>([]);

export function updateAnnotations(annotations: Annotation[]): void {
  annotationsSignal.set(annotations);
}
