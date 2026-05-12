import { css } from 'lit';

/**
 * Lightweight layout helpers for knob rows and annotation items.
 * Interactive controls (inputs, selects, buttons, toggles) are now
 * rendered with Web Awesome components and do not need hand-crafted styles.
 *
 * Relies on the --db-* CSS custom properties set by designBridgeHostTokenStyles.
 */
export const baseControlStyles = css`
  /* ── Row layout ─────────────────────────── */
  .db-row {
    display: flex;
    align-items: center;
    gap: var(--wa-space-xs, 6px);
    padding: var(--wa-space-3xs, 4px) var(--wa-space-3xs, 4px);
  }
  .db-label {
    flex: 1;
    font-size: var(--wa-font-size-xs, 11px);
    color: var(--db-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Control wrapper ─────────────────────── */
  .db-control-wrap {
    flex-shrink: 0;
    min-width: 100px;
    max-width: 130px;
  }
  .db-control-wrap wa-select,
  .db-control-wrap wa-input {
    width: 100%;
    --wa-form-control-font-size: var(--wa-font-size-xs, 11px);
  }

  /* ── Empty state ─────────────────────────── */
  .db-empty {
    font-size: var(--wa-font-size-xs, 11px);
    color: var(--db-muted);
    padding: var(--wa-space-xs, 6px) var(--wa-space-3xs, 4px);
    font-style: italic;
  }

  /* ── Divider ─────────────────────────────── */
  .db-separator {
    border: none;
    border-top: 1px solid var(--db-border);
    margin: var(--wa-space-3xs, 4px) 0;
  }

  /* ── Actions area ────────────────────────── */
  .db-actions {
    display: flex;
    flex-direction: column;
    gap: var(--wa-space-3xs, 4px);
    padding: var(--wa-space-xs, 6px) var(--wa-space-s, 8px);
  }
  .db-actions wa-button { width: 100%; }

  /* ── Icon button ─────────────────────────── */
  .db-icon-btn {
    all: unset;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: var(--db-radius);
    font-size: var(--wa-font-size-s, 12px);
    flex-shrink: 0;
    color: var(--db-muted);
    line-height: 1;
  }
  .db-icon-btn:hover { color: var(--db-red); background: var(--db-surface); }
`;
