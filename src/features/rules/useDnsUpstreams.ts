import {useMemo, useState} from 'react';
import {errorText} from '../../api/error';
import {getApi} from '../../api';
import {offered} from '../../api/capabilities';
import {readConfigFresh, refetchAll, useCapabilities, useConfig, useConfigEditor} from '../../store';
import {useCompleteness} from '../../store/config';
import {
  addDnsUpstream,
  aliasDnsUpstream,
  removeDnsUpstream,
  editDnsUpstream,
  readDnsUpstreams,
  renameDnsReferences,
  validDnsAddress,
  validUpstreamName
} from '../../dae/dnsUpstreams';
import {fileName} from '../../dae/sources';
import {useT} from '../../i18n';
import {toast} from '../../ui/ui';

const reread = () => void refetchAll();
export function useDnsUpstreams() {
  const t = useT();
  const resources = useCapabilities().data?.resources;
  const config = useConfig(offered(resources, 'config', {whileLoading: false}));
  const sources = useMemo(() => config.data?.sources ?? [], [config.data]);
  const complete = useCompleteness(sources);
  const editor = useConfigEditor(reread);
  const [draft, setDraft] = useState<{sourceId: string; old: string | null; name: string; address: string; staged?: boolean} | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const rows = sources.flatMap(source =>
    readDnsUpstreams(source.content ?? '').map(entry => ({
      ...entry,
      id: `${source.id}:${entry.from}`,
      sourceId: source.id,
      file: fileName(source),
      writable: source.writable && complete(source) === true
    }))
  );
  const owner = sources.find(source => source.id === draft?.sourceId);
  const changedName = !!draft?.old && draft.name !== draft.old;
  const blocked =
    !owner?.writable ||
    (changedName &&
      sources.some(
        source =>
          (source.kind === 'main' || source.kind === 'include') &&
          (complete(source) !== true || (!source.writable && renameDnsReferences(source.content ?? '', draft.old!, draft.name) !== (source.content ?? '')))
      ));
  const invalid =
    !!draft &&
    (!validUpstreamName(draft.name) ||
      !validDnsAddress(draft.address) ||
      rows.some(row => row.name === draft.name && !(row.sourceId === draft.sourceId && (row.name === draft.old || (draft.staged && row.name === draft.name)))));
  const close = () => {
    if (!saving) {
      setDraft(null);
      setFailure(null);
    }
  };
  const save = async () => {
    if (!draft || invalid || blocked || saving) return;
    setSaving(true);
    setFailure(null);
    try {
      const snapshot = (await readConfigFresh(getApi(), new AbortController().signal)).sources;
      if (snapshot.length !== sources.length || snapshot.some(source => source.content_sha256 !== sources.find(old => old.id === source.id)?.content_sha256)) {
        setFailure(t('rule.stale'));
        return;
      }
      const source = snapshot.find(source => source.id === draft.sourceId)!;
      const other = draft.old
        ? snapshot.filter(item => item.id !== source.id && renameDnsReferences(item.content ?? '', draft.old!, draft.name) !== (item.content ?? ''))
        : [];
      const expected = new Map(snapshot.map(source => [source.id, source.content]));
      const write = async (id: string, transform: (text: string) => string | null) => {
        const fresh = (await readConfigFresh(getApi(), new AbortController().signal)).sources.find(item => item.id === id);
        if (!fresh || fresh.content !== expected.get(id)) {
          setFailure(t('rule.stale'));
          return false;
        }
        const next = transform(fresh.content!);
        if (next === null) {
          setFailure(t('rule.stale'));
          return false;
        }
        const result = await editor.apply(fresh, next);
        if (result && !result.diagnostics) expected.set(id, next);
        if (result?.diagnostics) setFailure(t('ui.writeInvalid', {n: result.diagnostics.length}));
        return !!result && !result.diagnostics;
      };
      // Across files, keep the old name until all references use the new one. Each intermediate config remains valid.
      if (changedName && (other.length || draft.staged)) {
        if (!draft.staged) {
          if (!(await write(source.id, text => aliasDnsUpstream(text, draft.old!, draft.name, draft.address)))) return;
          setDraft({...draft, staged: true});
        }
        for (const item of other) if (!(await write(item.id, text => renameDnsReferences(text, draft.old!, draft.name)))) return;
        const latest = (await readConfigFresh(getApi(), new AbortController().signal)).sources;
        if (latest.some(item => item.id !== source.id && renameDnsReferences(item.content ?? '', draft.old!, draft.name) !== (item.content ?? ''))) {
          setFailure(t('rule.stale'));
          return;
        }
        if (
          !(await write(source.id, text => {
            const removed = removeDnsUpstream(text, draft.old!);
            return removed === null ? null : renameDnsReferences(removed, draft.old!, draft.name);
          }))
        )
          return;
      } else if (
        !(await write(source.id, text => {
          const next = draft.old ? editDnsUpstream(text, draft.old, draft.name, draft.address) : addDnsUpstream(text, draft.name, draft.address);
          return next === null ? null : draft.old ? renameDnsReferences(next, draft.old, draft.name) : next;
        }))
      )
        return;
      toast('positive', t('ui.saved'));
      setDraft(null);
    } catch (error) {
      setFailure(errorText(error, t));
    } finally {
      setSaving(false);
      reread();
    }
  };
  const addSource =
    sources.find(source => source.writable && complete(source) === true && readDnsUpstreams(source.content ?? '').length) ??
    sources.find(source => source.kind === 'main' && source.writable && complete(source) === true);
  return {
    rows,
    canAdd: !!addSource,
    draft,
    setDraft,
    save,
    close,
    saving,
    error: editor.error ?? config.error,
    failure,
    reason: blocked ? t('rule.dns.renameBlocked') : invalid ? t('rule.dns.upstreamInvalid') : null,
    disabled: blocked || invalid,
    retry: config.refetch,
    canWrite: resources?.config.writable === true,
    open: (id: string) => {
      const row = rows.find(row => row.id === id);
      if (row) setDraft({sourceId: row.sourceId, old: row.name, name: row.name, address: row.address});
    },
    add: () => {
      if (addSource) setDraft({sourceId: addSource.id, old: null, name: '', address: ''});
    }
  };
}
