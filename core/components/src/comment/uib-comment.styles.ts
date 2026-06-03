import { css } from 'lit';
import { uiBridgeHostTokenStyles } from '../styles/tokens.js';

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

  /* Raise the stacking context above other badge dots when the panel is open */
  :host([panel-open]) {
    z-index: 2147483647;
  }

  /* When hosted inside uib-orphaned-bar the element flows in the bar layout */
  :host([docked]) {
    position: relative;
    top: auto;
    left: auto;
    width: auto;
    height: auto;
    display: inline-flex;
    align-items: center;
    pointer-events: auto;
    z-index: auto;
  }

  /* ── Badge ─────────────────────────────── */
  wa-button.badge {
    pointer-events: auto;
    cursor: pointer;
    user-select: none;
    transition: transform 0.1s;
  }
  wa-button.badge:hover {
    transform: scale(1.25);
  }
  :host([docked]) wa-button.badge:hover {
    transform: none;
  }
  wa-button.badge.resolved {
    opacity: 0.55;
  }
  wa-button.badge.draft {
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
    background: var(--wa-color-surface-default);
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

  @keyframes uib-wobble {
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
    animation: uib-wobble 0.4s ease;
  }

  /* ── Header ─────────────────────────────── */
  .header {
    display: flex;
    align-items: center;
    gap: var(--wa-space-3xs);
    padding: var(--wa-space-2xs) var(--wa-space-s);
    border-bottom: 1px solid var(--wa-color-surface-border);
  }
  .header:has(+ .chips-bar) {
    border-bottom: none;
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
    padding: var(--wa-space-xs) var(--wa-space-s);
  }
  .comment-text {
    font-size: var(--wa-font-size-xs);
    line-height: 1.5;
    color: var(--wa-color-text-normal);
    white-space: pre-wrap;
    word-break: break-word;
    margin: var(--wa-space-xs) 0 0;
  }

  textarea {
    display: none;
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
  .textarea-wrap {
    position: relative;
  }
  .textarea-wrap wa-textarea::part(textarea) {
    margin-bottom: 36px;
  }
  .composer-send {
    position: absolute;
    bottom: var(--wa-space-xs);
    right: var(--wa-space-xs);
  }

  /* ── Tweaks section ────────────────────────── */
  .tweaks-section {
    border-top: 1px solid var(--wa-color-surface-border);
    padding: var(--wa-space-xs) var(--wa-space-s) var(--wa-space-3xs);
  }
  .tweak-row {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--wa-space-xs);
    padding: 3px 0;
    font-size: var(--wa-font-size-xs);
    position: relative;
  }
  .tweak-actions {
    position: absolute;
    top: -8px;
    right: 0;
    display: flex;
    align-items: center;
    gap: 0;
    transform: scale(0.9);
    transform-origin: top right;
  }
  /* Shorten the WA form-control label so it doesn't slide under the action buttons */
  .tweak-row wa-select::part(form-control-label),
  .tweak-row wa-radio-group::part(form-control-label),
  .tweak-row wa-input::part(form-control-label),
  .tweak-row wa-number-input::part(form-control-label),
  .tweak-row wa-textarea::part(form-control-label),
  .tweak-row wa-switch::part(form-control-label) {
    max-width: calc(100% - 56px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tweak-actions wa-dropdown {
    margin-left: auto;
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
    color: var(--wa-color-neutral);
  }

  /* ── Replies ──────────────────────────────────── */
  .reply {
    margin-bottom: var(--wa-space-xs);
    font-size: var(--wa-font-size-s);
  }
  .reply.agent {
    background: var(--wa-color-brand-05);
    border-radius: var(--wa-border-radius-m);
    padding: var(--wa-space-xs) var(--wa-space-s);
  }
  .reply.agent.no-top-radius {
    border-top-left-radius: 2px;
    border-top-right-radius: 2px;
  }
  .reply.agent.no-bottom-radius {
    border-bottom-left-radius: 2px;
    border-bottom-right-radius: 2px;
  }
  .reply.group-gap {
    margin-bottom: 1px;
  }
  .reply-author-tag {
    display: block;
    color: var(--wa-color-brand);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.01em;
    margin-bottom: var(--wa-space-2xs);
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
  /* Tweak row inside agent reply */
  .reply.agent .tweak-row {
    padding: 0;
    margin: 0;
  }
  .edit-actions {
    display: flex;
    gap: var(--wa-space-xs);
    margin-top: var(--wa-space-xs);
    margin-bottom: var(--wa-space-s);
  }
  textarea[data-role='edit'] {
    display: none;
  }
`;

export const commentItemStyles = [uiBridgeHostTokenStyles, ANNOTATION_ITEM_LOCAL_STYLES];
