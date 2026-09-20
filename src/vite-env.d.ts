/// <reference types="vite/client" />
declare module '*.jpg' {
  const src: string;
  export default src;
}
// Filled in by vite.config.ts from package.json.
interface ImportMetaEnv {
  readonly VITE_DOONA_VERSION: string;
  readonly VITE_DOONA_CONTRACT_COMMIT: string;
  readonly VITE_DOONA_REPO: string;
  readonly VITE_ENGINE_ORG: string;
}
