import { Signal } from 'signal-polyfill';

export type SnapPosition = 'left' | 'right' | 'top' | 'bottom';

export type ActiveTab = 'tweaks' | 'annotations';

export interface PanelPersistedState {
  top?: number;
  left?: number;
  width?: number;
  height?: number;
  collapsed?: boolean;
  activeTab?: ActiveTab;
  snap?: SnapPosition | null;
}

/**
 * Signal store for panel UI state (tab selection, collapse, position/snap).
 *
 * Components read from signals; the adapter persists changes to localStorage.
 */
export const activeTabSignal = new Signal.State<ActiveTab>('tweaks');
export const collapsedSignal = new Signal.State<boolean>(false);
export const snapSignal = new Signal.State<SnapPosition | null>(null);

export function setActiveTab(tab: ActiveTab): void {
  activeTabSignal.set(tab);
}

export function setCollapsed(collapsed: boolean): void {
  collapsedSignal.set(collapsed);
}

export function setSnap(snap: SnapPosition | null): void {
  snapSignal.set(snap);
}

/** Hydrate store from a persisted state snapshot (e.g. from localStorage). */
export function hydrateFromPersisted(saved: PanelPersistedState): void {
  if (saved.activeTab) activeTabSignal.set(saved.activeTab);
  if (saved.collapsed !== undefined) collapsedSignal.set(saved.collapsed);
  if (saved.snap !== undefined) snapSignal.set(saved.snap ?? null);
}
