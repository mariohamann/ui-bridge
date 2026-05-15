import { css } from 'lit';
import { designBridgeHostTokenStyles } from '../styles/tokens.js';

const DB_REVIEW_LOCAL_STYLES = css`
  :host {
    display: block;
    background: var(--wa-color-surface-default);
    color: var(--wa-color-text-normal);
    font-family: var(--wa-font-family-body);
    font-size: var(--wa-font-size-s);
    min-height: 100vh;
  }

  /* ── Top bar ── */
  .bar {
    position: sticky;
    top: 0;
    z-index: 100;
    background: var(--wa-color-surface-default);
    border-bottom: 1px solid var(--wa-color-surface-border);
    padding: var(--wa-space-xs) var(--wa-space-s);
    display: flex;
    align-items: center;
    gap: var(--wa-space-s);
  }
  .bar-title {
    font-size: var(--wa-font-size-xs);
    font-weight: var(--wa-font-weight-bold);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--wa-color-text-quiet);
    flex: 1;
  }
  .bar-title strong {
    color: var(--wa-color-brand);
  }
  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--wa-color-surface-border);
    flex-shrink: 0;
  }
  .dot.ok {
    background: var(--wa-color-success);
  }
  .toggle-label {
    font-size: var(--wa-font-size-xs);
    color: var(--wa-color-text-quiet);
    white-space: nowrap;
  }

  /* ── List ── */
  .list {
    max-width: 620px;
    margin: 0 auto;
    padding: var(--wa-space-s) var(--wa-space-l) 80px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .empty {
    text-align: center;
    color: var(--wa-color-text-quiet);
    padding: 72px var(--wa-space-l);
    font-size: var(--wa-font-size-s);
    line-height: 1.7;
  }

  /* ── Row ── */
  .row {
    display: flex;
    align-items: flex-start;
    gap: var(--wa-space-s);
    padding: var(--wa-space-xs) var(--wa-space-s) var(--wa-space-xs) var(--wa-space-s);
    border-radius: var(--wa-border-radius-s);
    cursor: pointer;
    position: relative;
    border-bottom: 1px solid color-mix(in srgb, var(--wa-color-surface-border) 50%, transparent);
    transition: background 0.1s;
  }
  .row:last-child {
    border-bottom: none;
  }
  .row:hover {
    background: var(--wa-color-brand-fill-quiet);
  }
  .row.resolved {
    opacity: 0.45;
  }
  .row.resolved:hover {
    opacity: 0.65;
  }

  .body {
    flex: 1;
    min-width: 0;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: var(--wa-space-2xs);
    margin-bottom: 2px;
    flex-wrap: wrap;
  }
  .src-label {
    font-size: var(--wa-font-size-xs);
    color: var(--wa-color-text-quiet);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }
  .comment {
    font-size: var(--wa-font-size-xs);
    line-height: 1.5;
    color: var(--wa-color-text-normal);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .comment.empty-comment {
    color: var(--wa-color-text-quiet);
    font-style: italic;
  }
  .footer {
    display: flex;
    align-items: center;
    gap: var(--wa-space-xs);
    margin-top: var(--wa-space-3xs);
  }

  .row-menu {
    flex-shrink: 0;
    align-self: flex-start;
    opacity: 0;
    transition: opacity 0.1s;
  }
  .row:hover .row-menu {
    opacity: 1;
  }
  .inline-edit {
    display: block;
    width: 100%;
    margin-top: var(--wa-space-2xs);
  }
  .inline-edit-actions {
    display: flex;
    gap: var(--wa-space-xs);
    margin-top: var(--wa-space-xs);
  }
`;

export const dbReviewStyles = [designBridgeHostTokenStyles, DB_REVIEW_LOCAL_STYLES];
