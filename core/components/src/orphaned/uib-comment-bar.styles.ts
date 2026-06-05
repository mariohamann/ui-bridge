import { css } from 'lit';
import { uiBridgeHostTokenStyles } from '../styles/tokens.js';

export const dbCommentBarStyles = [
  uiBridgeHostTokenStyles,
  css`
    :host {
      position: fixed;
      z-index: 2147483647;
      color-scheme: dark;
      direction: ltr;
      pointer-events: none;
      display: block;
    }

    uib-preferences-dialog {
      pointer-events: auto;
    }

    /* ── Position variants ──────────────────────────── */
    .bar {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      pointer-events: auto;
      background: var(--wa-color-surface-raised);
      border: 1px solid var(--wa-color-surface-border);
      border-radius: var(--wa-border-radius-l);
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.55);
      padding: 4px;
      gap: 0;
    }

    .bar--top-left {
      top: 12px;
      left: 12px;
      position: fixed;
    }
    .bar--top-right {
      top: 12px;
      right: 12px;
      position: fixed;
      align-items: flex-end;
    }
    .bar--bottom-left {
      bottom: 12px;
      left: 12px;
      position: fixed;
    }
    .bar--bottom-right {
      bottom: 12px;
      right: 12px;
      position: fixed;
      align-items: flex-end;
    }

    /* ── Comments container ──────────────────────────── */
    .bar__comments {
      display: flex;
      flex-direction: column;
      align-items: inherit;
      gap: 0;
      width: 100%;
    }

    /* ── Gear / preferences button ──────────────────── */
    .preferences-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      margin: 2px auto 0;
      padding: 0;
      border: none;
      border-radius: var(--wa-border-radius-m, 6px);
      background: transparent;
      color: var(--wa-color-neutral-400, #888);
      cursor: pointer;
      transition:
        background 0.15s ease,
        color 0.15s ease;
      pointer-events: auto;
    }
    .preferences-btn:hover {
      background: var(--wa-color-neutral-100, rgba(255, 255, 255, 0.08));
      color: var(--wa-color-neutral-0, #fff);
    }

    /* ── Collapsed: all badges stack ──────────────────── */
    uib-comment {
      margin-top: -18px;
      transition:
        margin-top 0.2s ease,
        opacity 0.2s ease,
        transform 0.2s ease;
      position: relative;
    }
    /* First badge (newest) has no top margin — nothing above it */
    uib-comment:first-child {
      margin-top: 0;
    }

    /* Overflow badges peek slightly behind */
    uib-comment.overflow-hidden {
      opacity: 0;
      display: none;
      pointer-events: none;
    }

    /* ── Overflow count pill ──────────────────────── */
    .overflow-pill {
      margin-top: 4px;
      transition: margin-top 0.2s ease;
      background: var(--wa-color-brand-600);
      border-radius: 999px;
      padding: 4px 0;
      text-align: center;
      width: 100%;
      font: 700 11px / 1 var(--wa-font-family-body);
      color: #fff;
      user-select: none;
      pointer-events: none;
      position: relative;
      z-index: 2;
    }

    /* ── Hovered or panel open: fan out, show all ──────────────────── */
    .bar:hover uib-comment,
    .bar:has(uib-comment[panel-open]) uib-comment {
      margin-top: 8px;
      opacity: 1;
      transform: scale(1);
      pointer-events: auto;
      display: block;
    }
    .bar:hover uib-comment:first-child,
    .bar:has(uib-comment[panel-open]) uib-comment:first-child {
      margin-top: 0;
    }
    .bar:hover .overflow-pill,
    .bar:has(uib-comment[panel-open]) .overflow-pill {
      display: none;
    }
  `,
];
