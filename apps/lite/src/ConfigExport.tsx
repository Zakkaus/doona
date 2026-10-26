import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {Text} from '@astryxdesign/core/Text';
import {useToast} from '@astryxdesign/core/Toast';
import {useContext, useState} from 'react';
import {errorKey, LiteError, type Connection} from './api';
import {useMessages} from './i18n';
import {EditDialog} from './ui/EditDialog';
import {ExportDraftContext} from './ui/exportDraft';
import {RowEntrance} from './ui/motion';

export function useConfigExport(connection: Connection, dirty: boolean) {
  const t = useMessages();
  const toast = useToast();
  const registry = useContext(ExportDraftContext);
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState('active');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const download = async (draft: boolean, inDialog: boolean) => {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      const source = (await connection.api.config()).sources.find(source => source.kind === 'main');
      if (!source || typeof source.content !== 'string') throw new LiteError('incomplete');
      let content = source.content;
      if (draft) {
        const entry = registry.current;
        if (!entry) throw new LiteError('exportDraftUnavailable');
        if (entry.source.id !== source.id || entry.source.content_sha256 !== source.content_sha256) throw new LiteError('conflict');
        content = entry.content();
      }
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const filename = `doona-config-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.dae`;
      const url = URL.createObjectURL(new Blob([content], {type: 'text/plain;charset=utf-8'}));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      // Keep the URL alive while the browser starts a download, including on touch devices.
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast({body: t.exportDone.replace('{filename}', filename), type: 'info', isAutoHide: true});
      setOpen(false);
    } catch (error) {
      if (inDialog) setError(error);
      else toast({body: t[errorKey(error)], type: 'error', isAutoHide: false});
    } finally {
      setPending(false);
    }
  };
  return {
    pending,
    start: () => {
      if (dirty) {
        setVersion('active');
        setError(undefined);
        setOpen(true);
      } else void download(false, false);
    },
    dialog: (
      <EditDialog
        title={t.exportConfig}
        width={480}
        open={open}
        close={() => setOpen(false)}
        pending={pending}
        label={t.exportConfirm}
        confirm={() => void download(version === 'draft', true)}
        notice={error ? {error} : undefined}
        disabled={version === 'draft' && !registry.current}
        disabledReason={t.exportDraftUnavailable}
      >
        <RowEntrance>
          <RadioList label={t.exportVersion} value={version} onChange={setVersion}>
            <RadioListItem value="active" label={t.exportActive} />
            <RadioListItem value="draft" label={t.exportDraft} />
          </RadioList>
        </RowEntrance>
        {!registry.current && (
          <Text type="supporting" color="secondary">
            {t.exportDraftUnavailable}
          </Text>
        )}
      </EditDialog>
    )
  };
}
