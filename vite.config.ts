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
      const rulesDir = path.join(root, 'public', 'rules');
      if (fs.existsSync(iconDir)) {
        for (const file of fs.readdirSync(iconDir)) {
          if (!file.endsWith('.png')) continue;
          this.emitFile({ type: 'asset', fileName: 'icons/' + file, source: fs.readFileSync(path.join(iconDir, file)) });
        }
      }
      if (fs.existsSync(rulesDir)) {
        for (const file of fs.readdirSync(rulesDir)) {
          if (!file.endsWith('.json')) continue;
          this.emitFile({ type: 'asset', fileName: 'rules/' + file, source: fs.readFileSync(path.join(rulesDir, file), 'utf8') });
        }
      }
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
