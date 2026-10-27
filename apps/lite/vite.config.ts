import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {astryxStylex} from '@astryxdesign/build/vite';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {cataloguePart} from '../../tools/catalogue-parts.mjs';
import {bundledPackagesPlugin} from '../../tools/bundled-packages.mjs';

const editorRequire = createRequire(createRequire(import.meta.url).resolve('@codemirror/language'));

export default defineConfig({
  base: './',
  build: {manifest: true},
  plugins: [
    bundledPackagesPlugin(['vite', 'rolldown']),
    ...astryxStylex(),
    react(),
    {
      name: 'lite-boundary',
      enforce: 'pre',
      resolveId(source, importer) {
        if (source === '../fonts' && importer?.endsWith('/src/i18n/index.ts')) {
          return fileURLToPath(new URL('./src/systemFonts.ts', import.meta.url));
        }
      },
      // The shared sign-in and error helpers read the standard catalogues; lite loads each whole as its core part.
      load(id) {
        const part = cataloguePart(id);
        if (!part) return null;
        const whole = part.stage === 'core' ? readFileSync(new URL(`../../src/i18n/locales/${part.lang}.json`, import.meta.url), 'utf8') : '{}';
        return `export default ${whole}`;
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
