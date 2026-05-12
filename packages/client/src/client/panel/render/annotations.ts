import { html, type TemplateResult } from 'lit';
import type { Annotation } from '@design-bridge/core';
import { relativeTime } from '../annotation-item-utils.js';

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

/** Prefer source component name (e.g. "HeroSection") over raw element label. */
function sourceLabel(ann: Annotation): string {
  if (ann.source?.file) {
    const filename = ann.source.file.split('/').pop() ?? '';
    return filename.replace(/\.[^.]+$/, '');
  }
  return ann.labels[0] ?? '?';
}

function renderAnnotationRow(ann: Annotation, index: number, handlers: AnnotationHandlers): TemplateResult {
  const label = sourceLabel(ann);
  const resolved = !!ann.resolvedAt;
  const time = relativeTime(ann.createdAt || ann.timestamp);
  // Count only comment-type replies beyond the root message
  const extraReplies = Math.max(0, (ann.replies?.filter((r) => r.type === 'comment').length ?? 0) - 1);

  return html`
    <div class="db-ann-row${resolved ? ' db-ann-row--resolved' : ''}"
      @click=${() => handlers.onEdit(ann)}
      @mouseenter=${() => highlightAnnotation(ann)}
      @mouseleave=${() => clearHighlightAnnotation(ann)}>
      <div class="db-ann-header">
        <span class="db-ann-index">${resolved ? '✓' : `#${index + 1}`}</span>
        <span class="db-ann-label">${label}</span>
        <span class="db-ann-time">${time}</span>
        <button class="db-icon-btn db-icon-btn--del" title="Delete"
          @click=${(e: Event) => { e.stopPropagation(); handlers.onDelete(ann.id); }}>×</button>
      </div>
      ${ann.comment ? html`<div class="db-ann-body" title=${ann.comment}>${ann.comment}</div>` : ''}
      ${extraReplies > 0 ? html`<div class="db-ann-footer">${extraReplies} repl${extraReplies === 1 ? 'y' : 'ies'}</div>` : ''}
    </div>
  `;
}

export function renderAnnotations(
  annotations: Annotation[],
  handlers: AnnotationHandlers,
): TemplateResult {
  // Show newest first
  const sorted = [...annotations].sort((a, b) => (b.createdAt || b.timestamp) - (a.createdAt || a.timestamp));
  return html`
    <div class="db-annotate">
      ${sorted.length === 0
      ? html`<div class="db-empty">No annotations yet — hold Alt+Shift and click any element</div>`
      : html`
          <div class="db-ann-list">
            ${sorted.map((ann, i) => renderAnnotationRow(ann, i, handlers))}
          </div>
          <div class="db-separator"></div>
          <button class="db-btn db-btn--danger db-btn--full" @click=${handlers.onClear}>× Clear all</button>
        `
    }
    </div>
  `;
}
