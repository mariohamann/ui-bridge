/**
 * Path helpers — canonical locations of all UI Bridge directories and files
 * relative to a given project root.
 */

import { resolve } from 'node:path';

/** @param {string} root */
export const uiBridgeDir = (root) => resolve(root, '.ui-bridge');

/** @param {string} root */
export const commentsDir = (root) => resolve(root, '.ui-bridge', 'comments');

/** @param {string} root */
export const scriptsDir = (root) => resolve(root, '.ui-bridge', 'scripts');

/** @param {string} root */
export const filesDir = (root) => resolve(root, '.ui-bridge', 'files');

/** @param {string} root */
export const cacheDir = (root) => resolve(root, '.ui-bridge', '.cache');
