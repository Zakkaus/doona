/// <reference types="vite/client" />
declare module '*.jpg' {
  const src: string;
  export default src;
}
declare module '*.webp' {
  const src: string;
  export default src;
}
// Each language's startup-failure text and retry label, from tools/startup-text.mjs.
declare module 'virtual:startup-text' {
  const texts: Record<string, [problem: string, retry: string]>;
  export default texts;
}
// Filled in by vite.config.ts from package.json.
interface ImportMetaEnv {
  readonly VITE_DOONA_VERSION: string;
  readonly VITE_DOONA_CONTRACT_COMMIT: string;
  readonly VITE_DOONA_REPO: string;
  readonly VITE_ENGINE_ORG: string;
}
