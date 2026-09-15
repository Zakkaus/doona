import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {version} from './package.json';
import react from '@vitejs/plugin-react';
import optimizeLocales from '@react-aria/optimize-locales-plugin';

export default defineConfig({
  base: './',
  define: {
    'import.meta.env.VITE_DOONA_VERSION': JSON.stringify(version),
    'import.meta.env.VITE_DOONA_CONTRACT_COMMIT': JSON.stringify(
      readFileSync(new URL('contract/api-standardize/SOURCE.md', import.meta.url), 'utf8').match(/\bcommit ([0-9a-f]{7,40})\b/)![1]
    )
  },
  plugins: [
    react(),
    {
      ...optimizeLocales.vite({locales: ['zh-TW', 'zh-CN', 'en-US']}),
      enforce: 'pre'
    },
    {
      name: 'offline-shell',
      apply: 'build',
      enforce: 'post',
      generateBundle(_, bundle) {
        const files = Object.keys(bundle)
          .filter(name => name === 'index.html' || name.startsWith('assets/'))
          .sort();
        const template = readFileSync(new URL('public/sw.js', import.meta.url), 'utf8');
        const hash = createHash('sha256').update(template);
        for (const name of files) {
          const entry = bundle[name];
          hash.update(name).update(entry.type === 'chunk' ? entry.code : entry.source);
        }
        this.emitFile({
          type: 'asset',
          fileName: 'sw.js',
          source: template.replace('__BUILD_HASH__', hash.digest('hex').slice(0, 16)).replace("'__PRECACHE__'", JSON.stringify(files))
        });
      }
    }
  ],
  build: {
    target: ['es2022'],
    cssTarget: ['chrome120', 'safari17', 'firefox120', 'edge120'],
    cssMinify: 'lightningcss',
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('index.html', import.meta.url))
      }
    }
  }
});
