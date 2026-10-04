import {useCallback} from 'react';
import {useT} from '../../i18n';
import {toast} from '../../ui/ui';
import {copyText} from './copy';

// Copies one table row as text and says whether it worked.
export function useCopyRecord() {
  const t = useT();
  return useCallback(
    async (text: string) => {
      const copied = await copyText(text);
      toast(copied ? 'positive' : 'negative', t(copied ? 'ui.recordCopied' : 'ui.recordCopyFailed'));
    },
    [t]
  );
}
