import { Signal } from 'signal-polyfill';
import type { TweakKnob } from '@design-bridge/core';

/**
 * Signal store for tweak knobs.
 *
 * Read:   knobsSignal.get()
 * Update: updateKnobs(payload) — called by the WS adapter on tweak:schema
 */
export const knobsSignal = new Signal.State<TweakKnob[]>([]);

export function updateKnobs(knobs: TweakKnob[]): void {
  knobsSignal.set(knobs);
}

/** Convenience: returns the knob matching a marker, or undefined. */
export function getKnobByMarker(marker: string): TweakKnob | undefined {
  return knobsSignal.get().find((k) => k.marker === marker);
}
