import {createElement, lazy, useState, type ComponentProps, type ComponentType} from 'react';

function preloadable<P extends object>(load: () => Promise<{default: ComponentType<P>}>) {
  let loaded: ComponentType<P> | undefined;
  let pending: ReturnType<typeof load> | undefined;
  const preload = () =>
    (pending ??= load()
      .then(module => {
        loaded = module.default;
        return module;
      })
      .catch(error => {
        pending = undefined;
        throw error;
      }));
  const Lazy = lazy(preload);
  return {
    preload,
    Component: (props: P) => {
      const [Component] = useState(() => loaded ?? Lazy);
      return createElement(Component, props);
    }
  };
}

export const codeEditorChunk = preloadable(() => import('./ui/LiteCodeEditor'));
export const settingsChunk = preloadable<ComponentProps<typeof import('./SettingsDialog').SettingsDialog>>(() =>
  import('./SettingsDialog').then(module => ({default: module.SettingsDialog}))
);
export const commandsChunk = preloadable(() => import('./Commands'));

export const pageChunks = {
  groups: () => import('./Groups'),
  subscriptions: () => import('./Subscriptions'),
  nodes: () => import('./Nodes'),
  routing: () => import('./Routing'),
  dns: () => import('./Dns')
};

// The first CJK glyph in a new weight or size makes Chromium search the system fallback fonts on the main
// thread (about 50 ms at 4x CPU). Warm that search one glyph per idle slice.
async function preloadTextFont(text: string, code = false) {
  await document.fonts.ready;
  const root = document.querySelector('[data-astryx-theme]');
  if (!root) return;
  const style = getComputedStyle(root);
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return;
  const weight = code ? '400' : style.getPropertyValue('--font-weight-bold');
  const size = style.getPropertyValue(code ? '--text-supporting-size' : '--text-body-size');
  const family = style.getPropertyValue(code ? '--font-family-code' : '--font-family-body');
  context.font = `${weight} ${size} ${family}`;
  context.measureText(text);
}

export function warmGlyphsDuringIdle(text: string) {
  const queue = [' ', ...new Set(text)].flatMap(character => [() => preloadTextFont(character), () => preloadTextFont(character, true)]);
  let stopped = false;
  let idle = 0;
  let frame = 0;
  let timer = 0;
  const next = () => {
    if (stopped || !queue.length) return;
    const load = () => {
      if (stopped) return;
      void queue.shift()!()
        .catch(() => {})
        .finally(next);
    };
    if ('requestIdleCallback' in window) idle = window.requestIdleCallback(load);
    else timer = globalThis.setTimeout(load, 50);
  };
  frame = requestAnimationFrame(() => {
    timer = window.setTimeout(next, 0);
  });
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    if (idle) cancelIdleCallback(idle);
  };
}
