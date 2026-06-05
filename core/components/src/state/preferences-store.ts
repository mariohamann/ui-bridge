import { Signal } from 'signal-polyfill';
import type { UserPreferences } from '@ui-bridge/protocol';
import { DEFAULT_PREFERENCES } from '@ui-bridge/protocol';

/**
 * Signal store for user preferences.
 *
 * Read:   preferencesSignal.get()
 * Update: updatePreferences(partial) — called by the WS adapter (preferences:sync)
 */
export const preferencesSignal = new Signal.State<UserPreferences>({ ...DEFAULT_PREFERENCES });

export function updatePreferences(partial: Partial<UserPreferences>): void {
  const current = preferencesSignal.get();
  preferencesSignal.set({
    ...current,
    ...partial,
    routeMatching: partial.routeMatching
      ? { ...current.routeMatching, ...partial.routeMatching }
      : current.routeMatching,
  });
}
