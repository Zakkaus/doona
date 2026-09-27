import type {RecorderState} from '../../api/model';
import type {Key} from '../../i18n';

// Why a recorded list is empty: its recording switched off in Settings, a filter, or nothing recorded. The recorder
// state comes from the runtime settings rather than from the empty list, which cannot tell the three apart.
export function recorderEmpty(recorder: RecorderState | undefined, filtered: boolean, keys: {off: Key; filtered: Key; empty: Key}): Key {
  if (recorder?.allowed && recorder.mode === 'off') return keys.off;
  return filtered ? keys.filtered : keys.empty;
}
