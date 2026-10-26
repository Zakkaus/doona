import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {astryxStylex} from '@astryxdesign/build/vite';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const editorRequire = createRequire(createRequire(import.meta.url).resolve('@codemirror/language'));

export default defineConfig({
  base: './',
  build: {manifest: true},
  plugins: [
    ...astryxStylex(),
    react(),
    {
      name: 'lite-boundary',
      enforce: 'pre',
      resolveId(source, importer) {
        if (source === '../src/dae/groupFilters' && importer?.endsWith('/mock/activation.ts')) {
          return fileURLToPath(new URL('./src/demo/groupFilters.ts', import.meta.url));
        }
        if (source === './fixtures/inventory' && importer?.endsWith('/mock/inventory.ts')) {
          return fileURLToPath(new URL('./src/demo/inventory.ts', import.meta.url));
        }
        if (source === './fixtures/configuration' && importer?.endsWith('/mock/configuration.ts')) {
          return fileURLToPath(new URL('./src/demo/configuration.ts', import.meta.url));
        }
        if (source === '../fonts' && importer?.endsWith('/src/i18n/index.ts')) {
          return fileURLToPath(new URL('./src/systemFonts.ts', import.meta.url));
        }
      },
      generateBundle() {
        for (const id of this.getModuleIds()) {
          if (
            /\/src\/(?:ui|store)\/|\/react-aria(?:-components)?\/|\/src\/.*\.css$/.test(id) &&
            !id.includes('/apps/lite/') &&
            !/\/src\/ui\/code\/(?:dae|daeTokens|daeComplete|diagnostics)\.ts$/.test(id)
          ) {
            this.error(`Lite imported a full-app UI module: ${id}`);
          }
        }
      }
    }
  ],
  resolve: {
    dedupe: [
      'react',
      'react-dom',
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/language',
      '@codemirror/autocomplete',
      '@codemirror/lint',
      '@lezer/highlight'
    ],
    alias: {
      // Lezer NodeProp ids must come from one registry, including the shared dae parser.
      '@lezer/common': editorRequire.resolve('@lezer/common').replace(/index\.cjs$/, 'index.js'),
      'openapi-fetch': fileURLToPath(new URL('../../node_modules/openapi-fetch/dist/index.mjs', import.meta.url))
    }
  },
  server: {fs: {allow: [fileURLToPath(new URL('../..', import.meta.url))]}}
});
