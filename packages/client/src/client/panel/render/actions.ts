import { html, type TemplateResult } from 'lit';

export interface ActionHandlers {
  onRevert: () => void;
  onDiscard: () => void;
  onApply: () => void;
}

export function renderActions(hasKnobs: boolean, handlers: ActionHandlers): TemplateResult {
  if (!hasKnobs) return html``;
  return html`
    <div class="db-actions">
      <button class="db-btn db-btn--ghost" @click=${handlers.onRevert}>Revert</button>
      <button class="db-btn db-btn--danger" @click=${handlers.onDiscard}>Discard &amp; Exit</button>
      <button class="db-btn db-btn--primary" @click=${handlers.onApply}>Apply &amp; Exit</button>
    </div>
  `;
}
