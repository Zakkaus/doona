import {createElement, lazy, type ComponentType} from 'react';

// A lazily loaded component that renders directly once its module has arrived, so a page warmed in idle time
// opens without suspending. React holds a revealed Suspense fallback for at least 300 ms before swapping in the
// content, which a lazy component would pay on its first render even with its module already loaded.
export function preloadable<P extends object>(load: () => Promise<{default: ComponentType<P>}>) {
  let loaded: ComponentType<P> | undefined;
  let pending: Promise<{default: ComponentType<P>}> | undefined;
  const settle = async () => {
    try {
      const module = await load();
      loaded = module.default;
      return module;
    } catch (error) {
      // A failed load may be retried by the next render or warm-up.
      pending = undefined;
      throw error;
    }
  };
  const preload = () => (pending ??= settle());
  const Lazy = lazy(preload);
  function Preloaded(props: P) {
    return createElement(loaded ?? Lazy, props);
  }
  return {Component: Preloaded, preload};
}
