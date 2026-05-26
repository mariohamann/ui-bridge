import { withUiBridge } from '@ui-bridge/next';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: resolve(__dirname, '../../'),
  },
};

export default withUiBridge(nextConfig);
