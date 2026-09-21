// Anchor fixture ages and expiries to page load.
export const now = Date.now();
export const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();
export const ahead = (seconds: number) => new Date(now + seconds * 1000).toISOString();
export const observedAt = ago(0);
export const instanceId = 'mock-instance-1';
