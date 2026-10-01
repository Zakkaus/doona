// Docking and floating swap the panel's element, so the new one arrives from where the old one was: its offset is set
// as custom properties for the `rp-dock-in` keyframes, which run once.
const root = (docked: boolean) => document.querySelector<HTMLElement>(docked ? '.rp-side-dock' : '.rp-floating-panel');
let from: {left: number; top: number; at: number} | null = null;
export const rememberDock = (docked: boolean) => {
  const box = root(docked)?.getBoundingClientRect();
  from = box ? {left: box.left, top: box.top, at: performance.now()} : null;
};
export function arriveFromDock(docked: boolean) {
  const origin = from;
  from = null;
  const el = root(docked);
  if (!origin || !el || performance.now() - origin.at > 1000) return;
  const box = el.getBoundingClientRect();
  el.style.setProperty('--rp-dock-from', `${origin.left - box.left}px ${origin.top - box.top}px`);
  el.setAttribute('data-arriving', '');
  el.addEventListener(
    'animationend',
    () => {
      el.removeAttribute('data-arriving');
      el.style.removeProperty('--rp-dock-from');
    },
    {once: true}
  );
}
