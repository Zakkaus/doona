import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {version, repository, config} from './package.json';
import react from '@vitejs/plugin-react';
import optimizeLocales from '@react-aria/optimize-locales-plugin';

// lightningcss ships native binaries for x86_64, aarch64 and armv7; on any other architecture the build
// minifies CSS with esbuild instead, so a packager on riscv64 or loong64 is not stopped by it.
const cssMinify = (() => {
  try {
    createRequire(import.meta.url)('lightningcss');
    return 'lightningcss' as const;
  } catch {
    return 'esbuild' as const;
  }
})();

// The stylesheets each language's loader in src/i18n imports with its catalogue.
const languageStyles: Record<string, string> = {'src/fonts-tc.css': 'zh-TW', 'src/fonts-sc.css': 'zh-CN'};

export default defineConfig({
  base: './',
  define: {
    'import.meta.env.VITE_DOONA_VERSION': JSON.stringify(version),
    // The links the about box and the sidebar open: doona's own repository, and the organisation whose engine
    // (honk today, dae later) the backend names in its version; neither is written in a component.
    'import.meta.env.VITE_DOONA_REPO': JSON.stringify(repository.url.replace(/\.git$/, '')),
    'import.meta.env.VITE_ENGINE_ORG': JSON.stringify(config.engineOrg),
    'import.meta.env.VITE_DOONA_CONTRACT_COMMIT': JSON.stringify(
      readFileSync(new URL('contract/api-standardize/SOURCE.md', import.meta.url), 'utf8').match(/^Pin: (.+)$/m)![1]
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
        // A reader needs one language, so no catalogue or its stylesheet is installed up front. The worker caches the
        // language a page it controls reports, and any it loads later. Every file still counts towards the build hash.
        const languages: Record<string, string[]> = {};
        for (const name of files) {
          const entry = bundle[name];
          const lang =
            entry.type === 'chunk'
              ? entry.facadeModuleId && /\/src\/i18n\/locales\//.test(entry.facadeModuleId) && entry.name
              : entry.originalFileNames.map(file => languageStyles[file]).find(Boolean);
          if (lang) (languages[lang] ??= []).push(name);
        }
        const precache = files.filter(name => !Object.values(languages).flat().includes(name));
        const template = readFileSync(new URL('public/sw.js', import.meta.url), 'utf8');
        const hash = createHash('sha256').update(template);
        for (const name of files) {
          const entry = bundle[name];
          hash.update(name).update(entry.type === 'chunk' ? entry.code : entry.source);
        }
        this.emitFile({
          type: 'asset',
          fileName: 'sw.js',
          source: template
            .replace('__BUILD_HASH__', hash.digest('hex').slice(0, 16))
            .replace("'__PRECACHE__'", JSON.stringify(precache))
            .replace("'__LANGUAGES__'", JSON.stringify(languages))
        });
      }
    }
  ],
  build: {
    manifest: true,
    target: ['es2022'],
    cssTarget: ['chrome120', 'safari17', 'firefox121', 'edge120'],
    cssMinify,
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('index.html', import.meta.url))
      },
      output: {
        // Locale catalogues are named apart, so the service worker can leave them out of its precache.
        chunkFileNames: chunk =>
          chunk.facadeModuleId && /\/src\/i18n\/locales\//.test(chunk.facadeModuleId) ? 'assets/locale-[name]-[hash].js' : 'assets/[name]-[hash].js',
        manualChunks(id) {
          // clsx and use-sync-external-store are shared by react-aria and recharts; pinned here so the startup code does
          // not pull them from the charts chunk, and with it the whole of recharts.
          if (/\/node_modules\/(react|react-dom|scheduler|clsx|use-sync-external-store)\//.test(id)) return 'vendor-react';
          // react-aria is left to Rollup: forcing all of it into one startup chunk shipped the components that only lazy
          // pages use (drag and drop, grids) with the shell.
          if (/\/node_modules\/(recharts|d3-[^/]+|victory-vendor)\//.test(id)) return 'vendor-charts';
          if (/\/node_modules\/(@codemirror|@lezer|style-mod|w3c-keyname|crelt)\//.test(id)) return 'vendor-editor';
        }
      }
    }
  }
});
