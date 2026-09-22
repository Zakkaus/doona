// Scripted animations read the same motion tokens as the stylesheet; the fallback covers a document without it.
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function motionMs(name: '--rp-duration-refresh', fallback: number): number {
  const value = Number.parseFloat(token(name));
  return Number.isFinite(value) ? value : fallback;
}
export const motionEase = (name: '--rp-ease-out', fallback: string) => token(name) || fallback;
