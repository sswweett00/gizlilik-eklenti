import { defineConfig, type Plugin } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';
import fs from 'node:fs';
import path from 'node:path';

function copyExtensionAssets(): Plugin {
  return {
    name: 'copy-extension-assets',
    generateBundle() {
      const root = process.cwd();
      const iconDir = path.join(root, 'icons');
          },
  };
}

export default defineConfig({
  plugins: [crx({ manifest }), copyExtensionAssets()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
    emptyOutDir: true,
  },
});
