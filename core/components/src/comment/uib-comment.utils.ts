import type { CommentElement, SourceAnnotationConfig } from '@ui-bridge/protocol';

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ─── HTML comment walker ──────────────────────────────────────────────────────

/**
 * Walk previous sibling comment nodes at every ancestor level looking for a
 * node whose text matches `pattern`. Returns the first match.
 */
function findHtmlComment(
  el: Element,
  config: NonNullable<SourceAnnotationConfig['htmlComments']>[number],
): { path: string; line: number; column: number } | null {
  const re = new RegExp(config.pattern);
  const fileGroup = config.fileGroup ?? 1;
  const lineGroup = config.lineGroup;
  const columnGroup = config.columnGroup;

  let node: Node | null = el;
  while (node && node !== document.documentElement) {
    // Walk previous siblings looking for Comment nodes
    let sibling: Node | null = node.previousSibling;
    while (sibling) {
      if (sibling.nodeType === Node.COMMENT_NODE) {
        const match = re.exec(sibling.nodeValue ?? '');
        if (match) {
          const path = match[fileGroup];
          if (path) {
            return {
              path,
              line: lineGroup != null ? Number(match[lineGroup]) || 1 : 1,
              column: columnGroup != null ? Number(match[columnGroup]) || 0 : 0,
            };
          }
        }
      }
      sibling = sibling.previousSibling;
    }
    node = node.parentNode;
  }
  return null;
}

// ─── Data attribute helpers ───────────────────────────────────────────────────

function readDataAttributes(
  node: Element,
  attrs: NonNullable<SourceAnnotationConfig['dataAttributes']>,
): { path: string; line: number; column: number } | null {
  for (const entry of attrs) {
    if ('pathAttr' in entry) {
      const val = node.getAttribute(entry.pathAttr);
      if (val) {
        const [path, line, column] = val.split(':');
        if (path) return { path, line: Number(line) || 1, column: Number(column) || 0 };
      }
    } else {
      const file = node.getAttribute(entry.fileAttr);
      const loc = node.getAttribute(entry.locAttr);
      if (file && loc) {
        const [line, column] = loc.split(':');
        return { path: file, line: Number(line) || 1, column: Number(column) || 0 };
      }
    }
  }
  return null;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Reads framework-specific source-location attributes from the nearest ancestor
 * (or the element itself) that carries them.
 *
 * Built-in formats (always active as fallback):
 *   - code-inspector-plugin (Vite):  data-insp-path="file:line:column"
 *   - Astro dev mode:                data-astro-source-file + data-astro-source-loc="line:column"
 *
 * Pass `config` to add custom strategies (checked first):
 *   - `config.dataAttributes`  — additional data-attribute pairs (unlimited)
 *   - `config.htmlComments`    — HTML comment patterns (unlimited, e.g. Blade, Twig, Django)
 */
export function getSourceInfo(
  el: Element,
  config?: SourceAnnotationConfig,
): { path: string; line: number; column: number } | null {
  // 1. Custom data attributes (user-defined, highest priority)
  if (config?.dataAttributes?.length) {
    let node: Element | null = el;
    while (node && node !== document.documentElement) {
      const result = readDataAttributes(node, config.dataAttributes);
      if (result) return result;
      node = node.parentElement;
    }
  }

  // 2. HTML comment walker (e.g. Blade, Twig) — tries each pattern in order
  if (config?.htmlComments?.length) {
    for (const pattern of config.htmlComments) {
      const result = findHtmlComment(el, pattern);
      if (result) return result;
    }
  }

  // 3. Built-in data attributes
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
