import {useCallback, useSyncExternalStore} from 'react';
import {diagnostics, formatDiagnostics, type Diagnostic} from '../../api/diagnostics';
import {useT} from '../../i18n';
import {parseHash} from '../../shell/route';
import {useVersion} from '../../store';
import {toast} from '../../ui/ui';
import {copyText} from './copy';

// The recorded failures, oldest first.
export const useDiagnostics = () => useSyncExternalStore(diagnostics.subscribe, diagnostics.snapshot);

// Copies the given failures, or all recorded ones, as the text a bug report needs, and says whether it worked.
export function useCopyDiagnostics() {
  const t = useT();
  const version = useVersion().data;
  const engine = version && `${version.engine.name} ${version.engine.version}`;
  return useCallback(
    async (entries: Diagnostic[] = diagnostics.snapshot()) => {
      const copied = await copyText(
        formatDiagnostics(entries, {doona: import.meta.env.VITE_DOONA_VERSION, engine, route: '/' + parseHash(location.hash).route})
      );
      toast(copied ? 'positive' : 'negative', t(copied ? 'toast.copied' : 'toast.copyFailed'));
    },
    [engine, t]
  );
}
