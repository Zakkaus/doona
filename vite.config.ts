import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {version, repository, config} from './package.json';
import react from '@vitejs/plugin-react';
import optimizeLocales from '@react-aria/optimize-locales-plugin';

export default defineConfig({
  base: './',
  define: {
    'import.meta.env.VITE_DOONA_VERSION': JSON.stringify(version),
    // The links the about box and the sidebar open: doona's own repository, and the organisation whose engine
    // (honk today, dae later) the backend names in its version; neither is written in a component.
    'import.meta.env.VITE_DOONA_REPO': JSON.stringify(repository.url.replace(/\.git$/, '')),
    'import.meta.env.VITE_ENGINE_ORG': JSON.stringify(config.engineOrg),
    'import.meta.env.VITE_DOONA_CONTRACT_COMMIT': JSON.stringify(
      readFileSync(new URL('contract/api-standardize/SOURCE.md', import.meta.url), 'utf8').match(/\bcommit ([0-9a-f]{7,40})\b/)![1]
    )
  },
  plugins: [
    react(),
    {
      // The stored theme and language are stamped on <html> by an inline script before the stylesheet can paint,
      // so a returning dark-theme reader never sees a light first frame. The CSP allows that one script by hash.
      name: 'first-paint-stamp',
      transformIndexHtml(html) {
        const stamp = readFileSync(new URL('tools/stamp.js', import.meta.url), 'utf8');
        const digest = createHash('sha256').update(stamp).digest('base64');
        return html
          .replace("default-src 'self';", `default-src 'self'; script-src 'self' 'sha256-${digest}';`)
          .replace('<head>\n', `<head>\n<script>${stamp}</script>\n`);
      }
    },
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
    manifest: true,
    target: ['es2022'],
    cssTarget: ['chrome120', 'safari17', 'firefox120', 'edge120'],
    cssMinify: 'lightningcss',
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('index.html', import.meta.url))
      },
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
        manualChunks(id) {
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';
          if (/\/node_modules\/(react-aria-components|@react-aria\/[^/]+|@react-stately\/[^/]+|@internationalized\/[^/]+)\//.test(id)) return 'vendor-aria';
          if (/\/node_modules\/(recharts|d3-[^/]+|victory-vendor)\//.test(id)) return 'vendor-charts';
          if (/\/node_modules\/(@codemirror|@lezer|style-mod|w3c-keyname|crelt)\//.test(id)) return 'vendor-editor';
        }
      }
    }
  }
});
