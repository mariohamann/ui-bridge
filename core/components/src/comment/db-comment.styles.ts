import { css } from 'lit';
import { designBridgeHostTokenStyles } from '../styles/tokens.js';

const ANNOTATION_ITEM_LOCAL_STYLES = css`
  :host {
    position: fixed;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    pointer-events: none;
    z-index: 2147483645;
    color-scheme: dark;
  }

  /* ── Badge ─────────────────────────────── */
  wa-badge {
    pointer-events: auto;
    cursor: pointer;
    user-select: none;
    transition: transform 0.1s;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  }
  wa-badge:hover {
    transform: scale(1.25);
  }
  wa-badge.resolved {
    opacity: 0.55;
  }
  wa-badge.draft {
    opacity: 0.75;
  }

  /* ── Badge hover preview ─────────────────── */
  .badge-preview {
    position: fixed;
    pointer-events: none;
    background: var(--wa-color-surface-raised);
    color: var(--wa-color-text-normal);
    border: 1px solid var(--wa-color-surface-border);
    border-radius: var(--wa-border-radius-l);
    padding: var(--wa-space-xs) var(--wa-space-s);
    font: var(--wa-font-size-s)/1.4 var(--wa-font-family-body);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
    width: 220px;
    z-index: 2147483647;
    opacity: 0;
    transform: scale(0.95);
    transition:
      opacity 0.12s ease,
      transform 0.12s ease;
  }
  .badge-preview.visible {
    opacity: 1;
    transform: scale(1);
  }
  .badge-preview-text {
    font-size: 12px;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    overflow: hidden;
    word-break: break-word;
  }
  .badge-preview-meta {
    font-size: var(--wa-font-size-2xs);
    color: var(--wa-color-text-quiet);
    margin-top: var(--wa-space-3xs);
  }

  /* ── Panel ─────────────────────────────── */
  .panel {
    position: fixed;
    pointer-events: auto;
    z-index: 2147483646;
    background: var(--wa-color-surface-raised);
    color: var(--wa-color-text-normal);
    border-radius: var(--wa-border-radius-l);
    border: 1px solid var(--wa-color-surface-border);
    padding: 0;
    width: min(320px, 90vw);
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    font: var(--wa-font-size-s)/1.5 var(--wa-font-family-body);
  }
  .panel-scroll {
    max-height: calc(100dvh - 32px);
    overflow-y: auto;
    overflow-x: hidden;
  }
  .panel[hidden] {
    display: none !important;
  }

  @keyframes db-wobble {
    0% {
      transform: translateX(0);
    }
    15% {
      transform: translateX(-6px) rotate(-1deg);
    }
    30% {
      transform: translateX(5px) rotate(1deg);
    }
    45% {
      transform: translateX(-4px) rotate(-0.5deg);
    }
    60% {
      transform: translateX(3px) rotate(0.5deg);
    }
    75% {
      transform: translateX(-2px);
    }
    100% {
      transform: translateX(0);
    }
  }
  .panel.wobble {
    animation: db-wobble 0.4s ease;
  }

  /* ── Header ─────────────────────────────── */
  .header {
    display: flex;
    align-items: center;
    gap: var(--wa-space-3xs);
    padding: var(--wa-space-s) var(--wa-space-s);
  }
  .header-title {
    flex: 1;
    font-size: var(--wa-font-size-xs);
    font-weight: var(--wa-font-weight-semibold);
    color: var(--wa-color-text-normal);
    letter-spacing: 0.02em;
  }

  /* ── Chips bar ─────────────────────────── */
  .chips-bar {
    display: flex;
    align-items: center;
    gap: var(--wa-space-3xs);
    padding: 0 var(--wa-space-s) var(--wa-space-xs);
    overflow-x: auto;
    scrollbar-width: none;
    border-bottom: 1px solid var(--wa-color-surface-border);
  }
  .chips-bar::-webkit-scrollbar {
    display: none;
  }

  /* ── Body ───────────────────────────────── */
  .body {
    padding: var(--wa-space-s) var(--wa-space-s);
  }
  .comment-text {
    font-size: var(--wa-font-size-s);
    line-height: 1.5;
    color: var(--wa-color-text-normal);
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0 0 var(--wa-space-xs);
  }

  textarea {
    width: 100%;
    box-sizing: border-box;
    background: transparent;
    color: var(--wa-color-text-normal);
    border: none;
    padding: var(--wa-space-s) var(--wa-space-s) var(--wa-space-3xs);
    font: inherit;
    font-size: var(--wa-font-size-s);
    field-sizing: content;
    resize: none;
    min-height: 2lh;
    outline: none;
  }
  @supports not (field-sizing: content) {
    textarea {
      overflow: hidden;
    }
  }

  .hint {
    font-size: var(--wa-font-size-xs);
    color: var(--wa-color-text-quiet);
    margin-bottom: var(--wa-space-s);
    font-style: italic;
  }

  /* ── Composer ─────────────────────────────── */
  .composer {
    padding: var(--wa-space-s);
  }
  .composer-inner {
    background: var(--wa-color-surface-lowered);
    border-radius: var(--wa-border-radius-l);
    overflow: hidden;
  }
  .composer-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: var(--wa-space-3xs) var(--wa-space-xs) var(--wa-space-xs);
  }

  /* ── Tweaks section ────────────────────────── */
  .tweaks-section {
    border-top: 1px solid var(--wa-color-surface-border);
    padding: var(--wa-space-xs) var(--wa-space-s) var(--wa-space-3xs);
  }
  .tweaks-section-header {
    display: flex;
    align-items: center;
    gap: var(--wa-space-3xs);
    margin-bottom: var(--wa-space-3xs);
  }
  .tweaks-section-title {
    flex: 1;
    font-size: var(--wa-font-size-2xs);
    font-weight: var(--wa-font-weight-bold);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--wa-color-text-quiet);
  }
  .tweak-row {
    display: flex;
    align-items: center;
    gap: var(--wa-space-xs);
    padding: 3px 0;
    font-size: var(--wa-font-size-xs);
  }
  .tweak-label {
    flex: 1;
    color: var(--wa-color-text-normal);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .tweak-value {
    font-family: var(--wa-font-family-code);
    font-size: var(--wa-font-size-xs);
    color: var(--wa-color-brand);
    background: var(--wa-color-brand-fill-quiet);
    border-radius: var(--wa-border-radius-s);
    padding: 1px var(--wa-space-2xs);
    white-space: nowrap;
    max-width: 90px;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
  }

  /* ── Tweak status badge (after accept/discard) ── */
  .tweak-status {
    display: flex;
    align-items: center;
    gap: var(--wa-space-2xs);
    border-top: 1px solid var(--wa-color-surface-border);
    padding: var(--wa-space-s) var(--wa-space-s);
    font-size: var(--wa-font-size-xs);
    color: var(--wa-color-text-quiet);
  }
  .tweak-status-icon {
    font-size: 14px;
    flex-shrink: 0;
  }
  .tweak-status.accepted .tweak-status-icon {
    color: var(--wa-color-success);
  }
  .tweak-status.discarded .tweak-status-icon {
    color: var(--wa-color-warning);
  }

  /* ── Reply author icon ──────────────────────── */
  .reply-row {
    display: flex;
    align-items: flex-start;
    gap: var(--wa-space-xs);
    margin-bottom: var(--wa-space-xs);
  }
  .reply-author-icon {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    margin-top: 2px;
  }
  .reply-author-icon.agent {
    background: var(--wa-color-brand-fill-quiet);
    color: var(--wa-color-brand);
  }
  .reply-author-icon.user {
    background: var(--wa-color-surface-lowered);
    color: var(--wa-color-text-quiet);
  }
  .reply-body {
    flex: 1;
    min-width: 0;
  }
  .reply-main {
    display: flex;
    align-items: flex-start;
    gap: var(--wa-space-xs);
  }
  .reply-content {
    flex: 1;
    min-width: 0;
  }
  .reply-menu {
    flex-shrink: 0;
  }
  .edit-actions {
    display: flex;
    gap: var(--wa-space-xs);
    margin-top: var(--wa-space-xs);
    margin-bottom: var(--wa-space-s);
  }
  textarea[data-role='edit'] {
    width: 100%;
    resize: none;
    font: var(--wa-font-size-s) / 1.4 var(--wa-font-family-body);
    background: var(--wa-color-surface-lowered);
    color: var(--wa-color-text-normal);
    border: 1px solid var(--wa-color-brand);
    border-radius: var(--wa-border-radius-m);
    padding: var(--wa-space-xs) var(--wa-space-s);
    outline: none;
    box-sizing: border-box;
    min-height: 52px;
  }
`;

export const commentItemStyles = [designBridgeHostTokenStyles, ANNOTATION_ITEM_LOCAL_STYLES];
