import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_ROOT = resolve(__dirname, '../.test-root');

export default async function globalTeardown(): Promise<void> {
  await rm(TEST_ROOT, { recursive: true, force: true });
}
