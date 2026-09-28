// Lets a page open the keyboard shortcuts dialog, as Settings does for people without a keyboard to press `?`. The
// dialog and its open state stay in Shortcuts, which listens here.
const listeners = new Set<() => void>();
export function openShortcuts() {
  listeners.forEach(listener => listener());
}
export function onOpenShortcuts(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
