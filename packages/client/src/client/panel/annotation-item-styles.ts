import { css } from 'lit';

export const annotationItemStyles = css`
  :host {
    --db-bg: #1e1e2e;
    --db-surface: #313244;
    --db-border: #45475a;
    --db-text: #cdd6f4;
    --db-muted: #6c7086;
    --db-amber: #f59e0b;
    --db-amber-dim: rgba(245,158,11,.12);
    --db-blue: #89b4fa;
    --db-red: #f38ba8;
    --db-green: #a6e3a1;
    --db-font-mono: ui-monospace, monospace;
    --db-font: 'Inter', system-ui, -apple-system, sans-serif;

    position: fixed;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    pointer-events: none;
    z-index: 2147483645;
  }

  /* ── Badge ─────────────────────────────── */
  .badge {
    position: fixed;
    pointer-events: auto;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--db-amber);
    color: #1e1e2e;
    font: 700 10px/20px ui-sans-serif, system-ui, sans-serif;
    text-align: center;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0,0,0,.4);
    user-select: none;
    transition: transform .1s;
  }
  .badge:hover { transform: scale(1.25); }
  .badge.resolved {
    background: var(--db-green);
    opacity: 0.55;
  }
  .badge.draft {
    opacity: 0.75;
    background: var(--db-amber);
  }

  /* ── Badge hover preview ─────────────────── */
  .badge-preview {
    position: fixed;
    pointer-events: none;
    background: var(--db-bg);
    color: var(--db-text);
    border: 1px solid var(--db-border);
    border-radius: 10px;
    padding: 5px 9px;
    font: 12px/1.4 var(--db-font);
    box-shadow: 0 4px 12px rgba(0,0,0,.45);
    width: 220px;
    z-index: 2147483647;
    opacity: 0;
    transform: scale(0.95);
    transition: opacity .12s ease, transform .12s ease;
  }
  .badge-preview.visible {
    opacity: 1;
    transform: scale(1);
  }
  .badge-preview-text {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    overflow: hidden;
    word-break: break-word;
  }
  .badge-preview-meta {
    font-size: 10px;
    color: var(--db-muted);
    margin-top: 2px;
  }

  /* ── Panel ─────────────────────────────── */
  .panel {
    position: fixed;
    pointer-events: auto;
    z-index: 2147483646;
    background: var(--db-bg);
    color: var(--db-text);
    border-radius: 14px;
    padding: 0;
    width: min(320px, 90vw);
    max-height: calc(100dvh - 32px);
    overflow-y: auto;
    box-shadow: 0 8px 24px rgba(0,0,0,.6);
    font: 13px/1.5 var(--db-font);
  }
  .panel[hidden] { display: none !important; }

  /* ── Header ─────────────────────────────── */
  .header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 10px;
  }
  .header-title {
    flex: 1;
    font-size: 12px;
    font-weight: 600;
    color: var(--db-text);
    letter-spacing: .02em;
  }
  .icon-btn {
    all: unset;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    color: var(--db-muted);
    font-size: 14px;
    line-height: 1;
    transition: background .1s, color .1s;
  }
  .icon-btn:hover { background: var(--db-surface); color: var(--db-text); }
  .icon-btn.resolve:hover { color: var(--db-green); }
  .icon-btn.close:hover { color: var(--db-red); }

  /* ── Overflow menu ──────────────────────── */
  .menu-wrap { position: relative; }
  .overflow-menu {
    position: absolute;
    top: 100%;
    right: 0;
    z-index: 1;
    background: var(--db-surface);
    border: 1px solid var(--db-border);
    border-radius: 6px;
    padding: 4px;
    min-width: 140px;
    box-shadow: 0 4px 12px rgba(0,0,0,.4);
  }
  .menu-item {
    all: unset;
    display: block;
    width: 100%;
    box-sizing: border-box;
    padding: 5px 10px;
    font-size: 12px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--db-text);
  }
  .menu-item:hover { background: var(--db-border); }
  .menu-item.danger { color: var(--db-red); }

  /* ── Chips bar ─────────────────────────── */
  .chips-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 10px 6px;
    overflow-x: auto;
    scrollbar-width: none;
    border-bottom: 1px solid var(--db-border);
  }
  .chips-bar::-webkit-scrollbar { display: none; }
  .chips-bar .chip {
    flex-shrink: 0;
    max-width: 160px;
  }
  .chips-bar .source-chip {
    flex-shrink: 0;
    margin-bottom: 0;
    max-width: 200px;
  }

  /* ── Body ───────────────────────────────── */
  .body { padding: 8px 12px; }

  .comment-text {
    font-size: 13px;
    line-height: 1.5;
    color: var(--db-text);
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0 0 6px;
  }
  .timestamp {
    font-size: 11px;
    color: var(--db-muted);
    margin-bottom: 8px;
  }

  textarea {
    width: 100%;
    box-sizing: border-box;
    background: transparent;
    color: var(--db-text);
    border: none;
    padding: 8px 10px 4px;
    font: inherit;
    font-size: 13px;
    field-sizing: content;
    resize: none;
    min-height: 2lh;
    outline: none;
  }

  @supports not (field-sizing: content) {
    textarea { overflow: hidden; }
  }

  /* ── Chips ──────────────────────────────── */
  .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--db-amber-dim);
    border: 1px solid var(--db-amber);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 11px;
    font-family: var(--db-font-mono);
    color: var(--db-amber);
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chip button {
    all: unset; cursor: pointer; color: var(--db-muted); font-size: 13px; line-height: 1;
  }
  .chip button:hover { color: var(--db-red); }

  .source-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(137,180,250,.12);
    border: 1px solid var(--db-blue);
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 11px;
    font-family: var(--db-font-mono);
    color: var(--db-blue);
    margin-bottom: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .source-chip-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .hint {
    font-size: 11px;
    color: var(--db-muted);
    margin-bottom: 8px;
    font-style: italic;
  }

  /* ── Composer ─────────────────────────────── */
  .composer {
    padding: 8px;
  }
  .composer-inner {
    background: var(--db-surface);
    border-radius: 10px;
    overflow: hidden;
  }
  .composer-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 4px 6px 6px;
  }
  .send-btn {
    all: unset;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--db-blue);
    color: #1e1e2e;
    font-size: 14px;
    flex-shrink: 0;
  }
  .send-btn:disabled {
    background: var(--db-surface);
    color: var(--db-muted);
    cursor: default;
  }

  /* ── Tweaks section ────────────────────────── */
  .tweaks-section {
    border-top: 1px solid var(--db-border);
    padding: 6px 12px 4px;
  }
  .tweaks-section-header {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 4px;
  }
  .tweaks-section-title {
    flex: 1;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--db-muted);
  }
  .tweak-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 0;
    font-size: 12px;
  }
  .tweak-label {
    flex: 1;
    color: var(--db-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .tweak-value {
    font-family: var(--db-font-mono);
    font-size: 11px;
    color: var(--db-amber);
    background: var(--db-amber-dim);
    border-radius: 3px;
    padding: 1px 5px;
    white-space: nowrap;
    max-width: 90px;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
  }
  .tweak-btn {
    all: unset;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 4px;
    font-size: 12px;
    line-height: 1;
    flex-shrink: 0;
    color: var(--db-muted);
    transition: background .1s, color .1s;
  }
  .tweak-btn:hover { background: var(--db-surface); }
  .tweak-btn.accept:hover { color: var(--db-green); }
  .tweak-btn.dismiss:hover { color: var(--db-red); }
  .tweak-accept-all {
    all: unset;
    cursor: pointer;
    font-size: 10px;
    font-weight: 600;
    color: var(--db-green);
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid var(--db-green);
    opacity: 0.75;
    transition: opacity .1s;
  }
  .tweak-accept-all:hover { opacity: 1; }
`;

