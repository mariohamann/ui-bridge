import { html, type TemplateResult } from 'lit';
import type { Annotation } from '@design-bridge/core';

export interface AnnotationHandlers {
  onEdit: (ann: Annotation) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

const HIGHLIGHT_ATTR = 'data-db-related';

function highlightAnnotation(ann: Annotation): void {
  for (const sel of ann.selectors) {
    try { document.querySelector(sel)?.setAttribute(HIGHLIGHT_ATTR, 'true'); } catch { /* noop */ }
  }
}

function clearHighlightAnnotation(ann: Annotation): void {
  for (const sel of ann.selectors) {
    try { document.querySelector(sel)?.removeAttribute(HIGHLIGHT_ATTR); } catch { /* noop */ }
  }
}

function renderAnnotationRow(ann: Annotation, index: number, handlers: AnnotationHandlers): TemplateResult {
  const primaryLabel = ann.labels[0] ?? '?';
  const extraCount = ann.labels.length - 1;
  const resolved = !!ann.resolvedAt;

  return html`
    <div class="db-ann-row${resolved ? ' db-ann-row--resolved' : ''}"
      @click=${() => handlers.onEdit(ann)}
      @mouseenter=${() => highlightAnnotation(ann)}
      @mouseleave=${() => clearHighlightAnnotation(ann)}>
      <div class="db-ann-meta">
        <div class="db-ann-targets">
          <span class="db-ann-index">${resolved ? '✓' : `${index + 1}.`}</span>
          <span class="db-ann-label">${primaryLabel}</span>
          ${extraCount > 0 ? html`<span class="db-ann-extra">+${extraCount}</span>` : ''}
        </div>
        ${ann.comment ? html`
          <div class="db-ann-comment" title=${ann.comment}>${ann.comment}</div>
        ` : ''}
      </div>
      <button class="db-icon-btn db-icon-btn--del" title="Delete"
        @click=${(e: Event) => { e.stopPropagation(); handlers.onDelete(ann.id); }}>×</button>
    </div>
  `;
}

export function renderAnnotations(
  annotations: Annotation[],
  handlers: AnnotationHandlers,
): TemplateResult {
  return html`
    <div class="db-annotate">
      ${annotations.length === 0
      ? html`<div class="db-empty">No annotations yet — hold Alt+Shift and click any element</div>`
      : html`
          <div class="db-ann-list">
            ${annotations.map((ann, i) => renderAnnotationRow(ann, i, handlers))}
          </div>
          <div class="db-separator"></div>
          <button class="db-btn db-btn--danger db-btn--full" @click=${handlers.onClear}>× Clear all</button>
        `
    }
    </div>
  `;
}
