import { css } from 'lit';
import { designBridgeHostTokenStyles } from '../styles/tokens.js';

export const dbOrphanedBarStyles = [
  designBridgeHostTokenStyles,
  css`
    :host {
      position: fixed;
      top: 12px;
      left: 12px;
      z-index: 2147483647;
      color-scheme: dark;
      direction: ltr;
      pointer-events: none;
      display: block;
    }

    .container {
      display: none;
      position: relative;
      pointer-events: auto;
      background: var(--wa-color-surface-raised);
      border: 1px solid var(--wa-color-surface-border);
      border-radius: var(--wa-border-radius-l);
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.55);
      padding: 4px;
      flex-direction: column;
      align-items: flex-start;
    }

    .container.has-children {
      display: flex;
    }

    .container ::slotted(db-comment) {
      margin-top: -12px !important;
      transition: margin-top 0.2s ease;
    }

    .container:hover ::slotted(db-comment) {
      margin-top: 4px !important;
    }

    .container ::slotted(db-comment:first-child) {
      margin-top: 0 !important;
    }
  `,
];
