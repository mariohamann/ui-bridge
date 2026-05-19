/**
 * Tweaks the gap between the number badge and text inside each list item
 * in HowItWorks.astro. Replaces all occurrences of `flex gap-*` on <li> elements.
 * @param {string} content
 * @param {string} value - Tailwind gap class, e.g. "gap-2"
 * @returns {string}
 */
export default function (content, value) {
  return content.replace(/(<li class="flex )gap-\d+(")/g, `$1${value}$2`);
}
