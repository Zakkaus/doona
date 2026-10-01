import {createContext} from 'react';

// Previews read cached snapshots without acquiring polling or event leases.
export const ResourcePreview = createContext(false);

export const ResourceSamples = createContext<{get: (name: string, data: unknown) => unknown} | null>(null);
