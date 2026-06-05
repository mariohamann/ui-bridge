import type { RouteMatchingConfig } from '@ui-bridge/protocol';

/**
 * Determines whether a comment's `pageUrl` matches the current page's URL
 * based on the user's route matching preferences.
 *
 * Returns `true` (show the comment) when:
 *   - No matching criteria are enabled (all flags false) — shows everything
 *   - All enabled criteria match
 *
 * @param commentUrl - The URL stored on the comment thread (meta.pageUrl)
 * @param currentUrl - The current window location URL
 * @param config     - Which URL parts to match against
 */
export function matchesCurrentRoute(
  commentUrl: string,
  currentUrl: string,
  config: RouteMatchingConfig,
): boolean {
  // If no criteria are enabled, show all comments regardless of URL
  if (!config.domain && !config.path && !config.params) return true;

  let comment: URL;
  let current: URL;
  try {
    comment = new URL(commentUrl);
    current = new URL(currentUrl);
  } catch {
    // Malformed URL — fall back to showing the comment
    return true;
  }

  if (config.domain && comment.host !== current.host) return false;
  if (config.path && comment.pathname !== current.pathname) return false;
  if (config.params && comment.search !== current.search) return false;

  return true;
}
