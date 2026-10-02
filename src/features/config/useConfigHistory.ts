import {useEffect, useState} from 'react';
import {getApi} from '../../api';
import {ApiError, LocalError, errorText} from '../../api/error';
import type {ConfigDiagnostic} from '../../api/model';
import {configManagement, configStore} from '../../api/engines';
import {useCapabilities, useConfig} from '../../store';
import {useConfigRevisions, useConfigRevisionAction} from '../../store/config';
import {useAction} from '../../store/action';
import {useDialogSession} from '../../shell/draft';
import {useT, useLang, LOCALE} from '../../i18n';
import {downloadFile, toast, toastFailure} from '../../ui/ui';
import {restartRequired} from '../../dae/sources';
import {diagnosticRows} from './view';
import {historyView} from './history';

export function useConfigHistory() {
  const t = useT();
  const locale = LOCALE[useLang()];
  const api = getApi();
  const capabilities = useCapabilities().data;
  const management = configManagement(capabilities);
  const config = useConfig(capabilities?.resources.config.available === true);
  const list = useConfigRevisions(management.revisions);
  const action = useConfigRevisionAction();
  const exporting = useAction<'export'>();
  const session = useDialogSession();
  useEffect(() => () => session.next(), [session]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{revision: number | null; head: number | null | undefined} | null>(null);
  const confirmation = dialog && {...dialog, ...action.pending};
  const [problem, setProblem] = useState<{id: number; text: string} | null>(null);
  const [diagnostics, setDiagnostics] = useState<ConfigDiagnostic[]>([]);
  const view = historyView(list.data, configStore(config.data), management.canActivate, locale, t, confirmation?.head);
  const detail = view.rows.find(row => row.id === selected);
  const target = view.rows.find(row => row.revision === confirmation?.revision);
  const close = () => {
    session.next();
    setDialog(null);
  };
  const show = (revision: number | null) => {
    session.next();
    setProblem(null);
    setDiagnostics([]);
    setDialog(action.pending ? {revision: action.pending.revision, head: action.pending.head} : {revision, head: list.error ? undefined : list.data?.active});
  };
  const submit = async (reread = false) => {
    if (!confirmation || action.busy || (reread ? !action.pending : !!action.pending)) return;
    const current = session.start();
    setProblem(null);
    setDiagnostics([]);
    try {
      const result = reread ? await action.reread() : await action.apply(confirmation.revision, management.replaceRequired, confirmation.head);
      if (getApi() !== api || !result) return;
      if ('changed' in result) {
        if (current()) {
          setDialog({revision: confirmation.revision, head: result.changed});
          setProblem({id: Date.now(), text: t('config.revisions.changed')});
        }
        return;
      }
      toast('positive', t(confirmation.revision === null ? 'config.backup.imported' : 'config.revisions.restored'));
      if (current()) close();
    } catch (error) {
      if (getApi() !== api) return;
      toastFailure(error, t, t('ui.writeFailed'));
      if (current()) {
        if (error instanceof LocalError && error.key === 'ui.operationUnknown') return;
        const diagnostics = ((error instanceof ApiError || error instanceof LocalError ? error.details : null) as {diagnostics?: ConfigDiagnostic[]} | null)
          ?.diagnostics;
        setDiagnostics(diagnostics ?? []);
        const restart = restartRequired(diagnostics ?? []);
        setProblem({id: Date.now(), text: restart ? t('config.writeRestart', {n: restart}) : errorText(error, t)});
      }
    }
  };
  return {
    management,
    list,
    view,
    detail,
    selected,
    setSelected,
    confirmation,
    target,
    problem,
    diagnostics: diagnosticRows(diagnostics, [], locale, t),
    busy: !!action.busy,
    confirmDisabled: !!confirmation?.operation || (confirmation?.revision === null ? !management.import : !target?.canRestore),
    show,
    close,
    submit: () => submit(),
    reread: () => submit(true),
    exporting: !!exporting.busy,
    exportError: exporting.error,
    export: async () => {
      const result = await exporting.run('export', signal => api.exportConfig(signal));
      if (result && getApi() === api) downloadFile(result.filename, result.content, result.contentType);
    }
  };
}
