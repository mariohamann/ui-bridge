import type { CommentElement } from '@design-bridge/protocol';

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * Reads framework-specific source-location attributes from the nearest ancestor
 * (or the element itself) that carries them.
 *
 * Supported formats:
 *   - code-inspector-plugin (Vite):  data-insp-path="file:line:column"
 *   - Astro dev mode:                data-astro-source-file + data-astro-source-loc="line:column"
 */
export function getSourceInfo(el: Element): { path: string; line: number; column: number; } | null {
  let node: Element | null = el;
  while (node && node !== document.documentElement) {
    const insp = node.getAttribute('data-insp-path');
    if (insp) {
      const [path, line, column] = insp.split(':');
      if (path) return { path, line: Number(line) || 1, column: Number(column) || 0 };
    }
    const astroFile = node.getAttribute('data-astro-source-file');
    const astroLoc = node.getAttribute('data-astro-source-loc');
    if (astroFile && astroLoc) {
      const [line, column] = astroLoc.split(':');
      return { path: astroFile, line: Number(line) || 1, column: Number(column) || 0 };
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Build a CommentElement descriptor from a DOM element and its minimal CSS selector.
 * Extracts tag, id, classes for structured storage.
 */
export function parseElement(el: Element, minimalSelector: string): CommentElement {
  return {
    minimalSelector,
    tag: el.tagName.toLowerCase(),
    id: el.id || undefined,
    classes: [...el.classList],
  };
}

/** @deprecated Use parseElement instead. */
export function shortLabel(el: Element): string {
  let label = el.tagName.toLowerCase();
  if (el.id) label += `#${el.id}`;
  else if (el.classList.length) label += `.${[...el.classList][0]}`;
  return label;
}

export function formatTweakReply(marker: string, value: string): string {
  return `Tweak ${marker} -> ${value}`;
}
