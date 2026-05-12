export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function shortLabel(el: Element): string {
  let label = el.tagName.toLowerCase();
  if (el.id) label += `#${el.id}`;
  else if (el.classList.length) label += `.${[...el.classList][0]}`;
  return label;
}

export function formatTweakReply(marker: string, value: string): string {
  return `Tweak ${marker} -> ${value}`;
}
