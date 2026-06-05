import { Signal } from 'signal-polyfill';
import type { UserPreferences, EffectivePreferences } from '@ui-bridge/protocol';
import { resolveEffectivePreferences } from '@ui-bridge/protocol';

/**
 * Signal store for user preferences.
 *
 * Read:   preferencesSignal.get()
 * Update: updatePreferences(partial) — called by the WS adapter (preferences:sync)
 */
export const preferencesSignal = new Signal.State<UserPreferences>({});

export function updatePreferences(partial: UserPreferences): void {
  const current = preferencesSignal.get();
  preferencesSignal.set(deepMerge(current, partial));
}

/** Returns fully resolved effective preferences for runtime use by UI components. */
export function getEffectivePreferences(): EffectivePreferences {
  return resolveEffectivePreferences(preferencesSignal.get());
}

/**
 * Deep merge b into a (non-destructive — returns new object).
 * Plain objects are merged recursively; primitives overwrite.
 */
function deepMerge<T extends object>(a: T, b: Partial<T>): T {
  const result = { ...a } as Record<string, unknown>;
  for (const key of Object.keys(b) as (keyof T)[]) {
    const bVal = b[key];
    const aVal = a[key];
    if (bVal !== null && typeof bVal === 'object' && !Array.isArray(bVal)) {
      result[key as string] = deepMerge(
        aVal !== null && typeof aVal === 'object' ? (aVal as object) : {},
        bVal as object,
      );
    } else if (bVal !== undefined) {
      result[key as string] = bVal;
    }
  }
  return result as T;
}
