import {EditorView} from '@codemirror/view';

// A key that would type or delete text. Shortcuts with Ctrl or Cmd are left alone; paste and cut arrive as their own events.
export function isEditKey(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey'>): boolean {
  if (event.key === 'Backspace' || event.key === 'Delete' || event.key === 'Enter') return true;
  return [...event.key].length === 1 && !event.ctrlKey && !event.metaKey;
}

// Calls `report` when someone tries to change a read-only document: a typing key, paste, cut, or a tap on a touch
// screen, where a tap is how the caret is placed. The handlers only observe; selection, copy and search still work.
export function readOnlyAttempts(report: () => void) {
  let touch = false;
  const attempt = (view: EditorView) => {
    if (view.state.readOnly) report();
    return false;
  };
  return EditorView.domEventHandlers({
    keydown: (event, view) => isEditKey(event) && attempt(view),
    paste: (_, view) => attempt(view),
    cut: (_, view) => attempt(view),
    pointerdown: event => {
      touch = event.pointerType === 'touch';
      return false;
    },
    click: (_, view) => touch && attempt(view)
  });
}
