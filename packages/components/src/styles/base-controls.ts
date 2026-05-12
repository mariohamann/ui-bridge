import { css } from 'lit';

/**
 * Shared styles for interactive control primitives used across panel and
 * annotation-item components: inputs, selects, toggles, and buttons.
 *
 * Relies on the --db-* CSS custom properties set by designBridgeHostTokenStyles.
 */
export const baseControlStyles = css`
  /* ── Row layout ─────────────────────────── */
  .db-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 4px;
  }
  .db-label {
    flex: 1;
    font-size: 11px;
    color: var(--db-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Form controls ───────────────────────── */
  .db-control-wrap {
    flex-shrink: 0;
    min-width: 100px;
    max-width: 120px;
  }
  .db-control {
    width: 100%;
    box-sizing: border-box;
    background: var(--db-surface);
    color: var(--db-text);
    border: 1px solid var(--db-border);
    border-radius: var(--db-radius);
    padding: 3px 6px;
    font: inherit;
    font-size: 11px;
    outline: none;
  }
  .db-control:focus { border-color: var(--db-amber); }
  .db-select { cursor: pointer; }
  .db-color { padding: 2px; height: 24px; cursor: pointer; }

  /* ── Toggle ─────────────────────────────── */
  .db-toggle {
    position: relative;
    display: inline-flex;
    cursor: pointer;
    flex-shrink: 0;
  }
  .db-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
  .db-toggle-track {
    width: 32px;
    height: 16px;
    border-radius: 8px;
    background: var(--db-border);
    transition: background .15s;
    position: relative;
  }
  .db-toggle-track::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--db-text);
    transition: transform .15s;
  }
  .db-toggle input:checked ~ .db-toggle-track { background: var(--db-amber); }
  .db-toggle input:checked ~ .db-toggle-track::after { transform: translateX(16px); }

  /* ── Buttons ─────────────────────────────── */
  .db-actions { display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; }
  .db-btn {
    padding: 5px 8px;
    border-radius: var(--db-radius);
    border: 1px solid transparent;
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    text-align: center;
  }
  .db-btn--primary { background: var(--db-amber); color: var(--db-bg); }
  .db-btn--danger { background: transparent; color: var(--db-red); border-color: var(--db-border); }
  .db-btn--ghost { background: var(--db-surface); color: var(--db-text); }
  .db-btn--full { width: 100%; box-sizing: border-box; display: block; margin-top: 4px; }

  /* ── Icon button ─────────────────────────── */
  .db-icon-btn {
    all: unset;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 12px;
    flex-shrink: 0;
  }
  .db-icon-btn--del { color: var(--db-muted); font-size: 14px; line-height: 1; }
  .db-icon-btn--del:hover { color: var(--db-red); }
  .db-icon-btn:hover { background: var(--db-surface); }

  /* ── Empty state ─────────────────────────── */
  .db-empty {
    font-size: 11px;
    color: var(--db-muted);
    padding: 6px 4px;
    font-style: italic;
  }

  /* ── Divider ─────────────────────────────── */
  .db-separator {
    border: none;
    border-top: 1px solid var(--db-border);
    margin: 4px 0;
  }
`;
