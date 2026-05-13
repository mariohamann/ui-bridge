import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import { designBridgeRspack } from '@design-bridge/unplugin';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default /** @type {import('@rspack/core').Configuration} */ ({
  entry: './src/main.js',
  output: {
    path: resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
        type: 'javascript/auto',
      },
    ],
  },
  plugins: [new HtmlWebpackPlugin({ template: './src/index.html' }), designBridgeRspack()],
  devServer: {
    port: 5175,
    hot: true,
  },
});
