import { css } from 'lit';

// Shared design tokens for panel/annotation components.
export const designBridgeHostTokenStyles = css`
  :host {
    --db-bg: #1e1e2e;
    --db-surface: #313244;
    --db-border: #45475a;
    --db-text: #cdd6f4;
    --db-muted: #6c7086;
    --db-subtext: #a6adc8;
    --db-amber: #f59e0b;
    --db-amber-dim: rgba(245, 158, 11, 0.12);
    --db-blue: #89b4fa;
    --db-red: #f38ba8;
    --db-green: #a6e3a1;
    --db-font-mono: ui-monospace, monospace;
    --db-font: 'Inter', system-ui, -apple-system, sans-serif;
    --db-radius: 4px;
    --db-panel-radius: 8px;
  }
`;
