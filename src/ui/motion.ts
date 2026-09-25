// Scripted animations read the same motion tokens as the stylesheet; the fallback covers a document without it.
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// A time in CSS units as milliseconds. The build's minifier writes 600ms as .6s, so both units are read.
export function durationMs(value: string, fallback: number): number {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return fallback;
  return /\ds$/.test(value) ? number * 1000 : number;
}
export const motionMs = (name: '--rp-duration-refresh', fallback: number) => durationMs(token(name), fallback);
export const motionEase = (name: '--rp-ease-out', fallback: string) => token(name) || fallback;
