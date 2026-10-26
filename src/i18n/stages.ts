// The catalogue stages in load order (tools/catalogue-parts.mjs explains them), shared by the loader and the build.
export const stages = ['core', 'activity', 'rest'] as const;
export type Stage = (typeof stages)[number];
