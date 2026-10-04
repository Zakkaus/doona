import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {version, repository, config} from './package.json';
import react from '@vitejs/plugin-react';
import optimizeLocales from '@react-aria/optimize-locales-plugin';
import {DEFAULT_PALETTE, palettes} from './src/shell/palettes';
import {rtlScripts} from './src/i18n/direction';
import {languages, REFERENCE_LANG} from './src/i18n/languages';
import {languageFiles} from './src/i18n/offline';
import {startupTextPlugin} from './tools/startup-text.mjs';
import {stampScript} from './tools/stamp.mjs';

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

// The mock backend, loaded only by the demo and development profiles.
const mockEntry = /\/mock\/index\.ts$/;

// The modules a module reaches by static imports; the Activity chunk takes those the shell entry does not reach.
const statics = (start: string, getModuleInfo: (id: string) => {importedIds: readonly string[]} | null) => {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length) {
    const id = queue.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...(getModuleInfo(id)?.importedIds ?? []));
  }
  return seen;
};
let reach: {activity: Set<string>; shell: Set<string>} | undefined;
function activityOnly(id: string, getModuleInfo: (id: string) => {importedIds: readonly string[]} | null) {
  if (!reach) {
    // The desktop panel and the dashboard's cards load with the page, so their code shares its chunk.
    const starts = ['Dashboard', 'WidgetContent', 'Widgets'].map(name => fileURLToPath(new URL(`src/shell/widgets/${name}.tsx`, import.meta.url)));
    const entry = fileURLToPath(new URL('src/main.tsx', import.meta.url));
    reach = {activity: new Set(starts.flatMap(start => [...statics(start, getModuleInfo)])), shell: statics(entry, getModuleInfo)};
  }
  return reach.activity.has(id) && !reach.shell.has(id);
}
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
    startupTextPlugin(),
    {
      name: 'font-notices',
      generateBundle() {
        for (const [fileName, path] of [
          ['fonts/OFL.txt', 'LICENSES/OFL-1.1.txt'],
          ['fonts/README', 'docs/fonts.md']
        ]) {
          this.emitFile({type: 'asset', fileName, source: readFileSync(new URL(path, import.meta.url), 'utf8')});
        }
      }
    },
    {
      // The stored theme and language are stamped on <html> by an inline script before the stylesheet can paint,
      // so a returning dark-theme reader never sees a light first frame. The CSP allows that one script by hash.
      name: 'first-paint-stamp',
      transformIndexHtml(html) {
        const stamp = stampScript({
          palettes: palettes.map(palette => palette.id),
          defaultPalette: DEFAULT_PALETTE,
          locales: Object.fromEntries(languages.map(language => [language.id, language.locale])),
          referenceLocale: languages.find(language => language.id === REFERENCE_LANG)!.locale,
          rtlScripts
        });
        const digest = createHash('sha256').update(stamp).digest('base64');
        return html
          .replace("default-src 'self';", `default-src 'self'; script-src 'self' 'sha256-${digest}';`)
          .replace('<head>\n', `<head>\n<script>${stamp}</script>\n`);
      }
    },
    {
      ...optimizeLocales.vite({locales: languages.map(language => language.locale)}),
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
        const perLanguage = languageFiles(
          files.map(name => {
            const entry = bundle[name];
            return entry.type === 'chunk'
              ? {name, catalogue: entry.facadeModuleId && /\/src\/i18n\/locales\//.test(entry.facadeModuleId) ? entry.name : null, sources: []}
              : {name, catalogue: null, sources: entry.originalFileNames};
          })
        );
        const languageOnly = new Set(Object.values(perLanguage).flat());
        // The mock backend serves the demo and development only; the worker caches it once a page reports running on it.
        const mock = files.filter(name => {
          const entry = bundle[name];
          return entry.type === 'chunk' && entry.facadeModuleId !== null && mockEntry.test(entry.facadeModuleId);
        });
        const precache = files.filter(name => !languageOnly.has(name) && !mock.includes(name));
        const template = readFileSync(new URL('public/sw.js', import.meta.url), 'utf8');
        const hash = createHash('sha256').update(template);
        for (const name of files) {
          const entry = bundle[name];
          hash.update(name).update(entry.type === 'chunk' ? entry.code : entry.source);
        }
        const build = hash.digest('hex').slice(0, 16);
        // index.html carries the build too, so a page can tell a worker of a new build from one of its own.
        const html = bundle['index.html'];
        if (html?.type !== 'asset' || !String(html.source).includes('<head>\n')) this.error('index.html has no <head> to stamp the build on');
        html.source = String(html.source).replace('<head>\n', `<head>\n<meta name="doona-build" content="${build}">\n`);
        this.emitFile({
          type: 'asset',
          fileName: 'sw.js',
          source: template
            .replace('__BUILD_HASH__', build)
            .replace("'__PRECACHE__'", JSON.stringify(precache))
            .replace("'__LANGUAGES__'", JSON.stringify(perLanguage))
            .replace("'__MOCK__'", JSON.stringify(mock))
        });
      }
    }
  ],
  // Catalogues are read whole as their default export, so each key needs no named export of its own.
  json: {namedExports: false},
  build: {
    // Even small slices stay separate so unicode-range controls their downloads.
    assetsInlineLimit: file => (/noto-sans-(tc|sc)-.*\.woff2$/.test(file) ? false : undefined),
    manifest: true,
    target: ['es2022'],
    // Terser reduces total gzip size without moving lazy modules into the shell.
    minify: 'terser',
    cssTarget: ['chrome120', 'safari17', 'firefox121', 'edge120'],
    cssMinify,
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('index.html', import.meta.url))
      },
      output: {
        // Keep optional CJK subsets out of the shell precache and in the separate font archive.
        assetFileNames: asset =>
          asset.names.some(name => /^noto-sans-(tc|sc)-.*\.woff2$/.test(name)) ? 'fonts/[name]-[hash][extname]' : 'assets/[name]-[hash][extname]',
        // Locale catalogues are named apart, so the service worker can leave them out of its precache.
        chunkFileNames: chunk =>
          chunk.facadeModuleId && /\/src\/i18n\/locales\//.test(chunk.facadeModuleId) ? 'assets/locale-[name]-[hash].js' : 'assets/[name]-[hash].js',
        // A manual chunk holds only the modules named for it; their other dependencies stay where Rollup puts them, so
        // the shell's modules are not pulled into the Activity chunk.
        onlyExplicitManualChunks: true,
        manualChunks(id, {getModuleInfo}) {
          // Keep the React runtime and react-aria shared utilities in the startup vendor chunk.
          if (/\/node_modules\/(react|react-dom|scheduler|clsx|use-sync-external-store)\//.test(id)) return 'vendor-react';
          // react-aria is left to Rollup so the components only lazy pages use (drag and drop, grids) stay out of the
          // startup chunk.
          if (/\/node_modules\/(@codemirror|@lezer|style-mod|w3c-keyname|crelt)\//.test(id)) return 'vendor-editor';
          // The Activity page is its own chunk, requested as the shell starts. Code it shares with later pages stays in
          // it rather than in many small shared chunks, since it is always loaded by then.
          if (activityOnly(id, getModuleInfo)) return 'activity';
        }
      }
    }
  }
});
