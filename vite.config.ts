import { defineConfig, type Plugin } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';
import fs from 'node:fs';
import path from 'node:path';

function copyExtensionIcons(): Plugin {
  return {
    name: 'copy-extension-icons',
    generateBundle() {
      const iconDir = path.join(process.cwd(), 'icons');
      if (!fs.existsSync(iconDir)) return;
      for (const file of fs.readdirSync(iconDir)) {
        if (!file.toLowerCase().endsWith('.png')) continue;
        this.emitFile({
          type: 'asset',
          fileName: 'icons/' + file,
          source: fs.readFileSync(path.join(iconDir, file)),
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [crx({ manifest }), copyExtensionIcons()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
    emptyOutDir: true,
  },
});
