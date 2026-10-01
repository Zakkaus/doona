let open = false;
const listeners = new Set<() => void>();
export const editorState = {
  snapshot: () => open,
  set(value: boolean) {
    open = value;
    listeners.forEach(notify => notify());
  },
  subscribe(notify: () => void) {
    listeners.add(notify);
    return () => {
      listeners.delete(notify);
    };
  }
};
