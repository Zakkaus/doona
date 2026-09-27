import type {RecorderState} from '../../api/model';
import type {Key} from '../../i18n';

// Why a recorded list is empty: the configuration forbids its recording, its recording switched off in Settings, a
// filter, or nothing recorded. The recorder state comes from the runtime settings rather than from the empty list, which
// cannot tell these apart.
export function recorderEmpty(recorder: RecorderState | undefined, filtered: boolean, keys: {forbidden: Key; off: Key; filtered: Key; empty: Key}): Key {
  if (recorder && !recorder.allowed) return keys.forbidden;
  if (recorder?.mode === 'off') return keys.off;
  return filtered ? keys.filtered : keys.empty;
}
