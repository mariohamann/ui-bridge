import { css } from 'lit';

/**
 * Styles for the main panel chrome: tabs, section headers, and annotation
 * list rows. Relies on --db-* custom properties.
 */
export const panelLayoutStyles = css`
  /* ── Panel chrome ─────────────────────────── */
  .panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: var(--db-bg);
    color: var(--db-text);
    border: 1px solid rgba(245, 158, 11, 0.35);
    border-radius: var(--db-panel-radius);
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(245, 158, 11, 0.08);
  }

  .panel-title {
    background: var(--db-surface);
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--db-text);
    border-bottom: 1px solid var(--db-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: grab;
    user-select: none;
    flex-shrink: 0;
  }
  .panel-title:active { cursor: grabbing; }

  .panel-snap-btns { display: flex; gap: 2px; margin-left: auto; }
  .panel-snap-btn {
    all: unset;
    cursor: pointer;
    width: 20px;
    height: 20px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: var(--db-muted);
    line-height: 1;
  }
  .panel-snap-btn:hover { background: var(--db-border); color: var(--db-text); }

  /* ── Section structure ─────────────────────── */
  .db-section { padding: 6px 8px; }
  .db-section-header { padding: 4px 4px 2px; }
  .db-section-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--db-muted);
  }

  /* ── Tabs ─────────────────────────────────── */
  .db-tabs {
    display: flex;
    flex-shrink: 0;
    border-bottom: 1px solid var(--db-border);
    background: var(--db-surface);
  }
  .db-tab {
    flex: 1;
    padding: 6px 8px;
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    color: var(--db-muted);
    background: transparent;
    border: none;
    cursor: pointer;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: color 0.1s, border-color 0.1s;
  }
  .db-tab:hover { color: var(--db-text); }
  .db-tab[aria-selected="true"] {
    color: var(--db-text);
    border-bottom-color: var(--db-amber);
  }
  .db-tab-badge {
    display: inline-block;
    background: var(--db-amber);
    color: var(--db-bg);
    border-radius: 8px;
    padding: 0 5px;
    font-size: 10px;
    font-weight: 700;
    line-height: 16px;
    margin-left: 4px;
    vertical-align: middle;
  }
  .db-tab-content {
    padding: 6px 8px;
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* ── Annotation list rows ─────────────────── */
  .db-ann-list { display: flex; flex-direction: column; }
  .db-ann-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 4px;
    border-radius: var(--db-radius);
    cursor: pointer;
    border-bottom: 1px solid rgba(69, 71, 90, 0.5);
  }
  .db-ann-row:last-child { border-bottom: none; }
  .db-ann-row:hover { background: rgba(245, 158, 11, 0.06); }
  .db-ann-row--resolved { opacity: 0.45; }
  .db-ann-row--resolved .db-ann-index { color: #a6e3a1; }
  .db-ann-header { display: flex; align-items: center; gap: 5px; min-width: 0; }
  .db-ann-index {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 700;
    color: var(--db-amber);
    font-variant-numeric: tabular-nums;
  }
  .db-ann-label {
    flex: 1;
    min-width: 0;
    font-size: 11px;
    color: var(--db-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .db-ann-time { flex-shrink: 0; font-size: 10px; color: var(--db-muted); }
  .db-ann-body {
    font-size: 11px;
    color: var(--db-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-left: 1px;
  }
  .db-ann-footer { font-size: 10px; color: var(--db-muted); padding-left: 1px; }
`;
