import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import react from '@vitejs/plugin-react';
import macros from 'unplugin-parcel-macros';
import optimizeLocales from '@react-aria/optimize-locales-plugin';

export default defineConfig({
  base: './',
  cacheDir: '/scratch/ssd/doona-store/vite',
  plugins: [
    macros.vite(), // Must be first: evaluates style({...}) at build time.
    react(),
    {
      ...optimizeLocales.vite({locales: ['zh-TW', 'zh-CN', 'en-US']}),
      enforce: 'pre'
    }
  ],
  build: {
    target: ['es2022'],
    cssMinify: 'lightningcss',
    rollupOptions: {
      input: {index: fileURLToPath(new URL('index.html', import.meta.url)), design: fileURLToPath(new URL('design.html', import.meta.url)), rp: fileURLToPath(new URL('rp.html', import.meta.url))},
      output: {
        manualChunks(id) {
          if (/macro-(.*)\.css$/.test(id) || /@react-spectrum\/s2\/.*\.css$/.test(id)) {
            return 's2-styles';
          }
        }
      }
    }
  }
});
