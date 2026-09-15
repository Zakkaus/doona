import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import react from '@vitejs/plugin-react';
import optimizeLocales from '@react-aria/optimize-locales-plugin';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      ...optimizeLocales.vite({locales: ['zh-TW', 'zh-CN', 'en-US']}),
      enforce: 'pre'
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
