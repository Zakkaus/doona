import {useMemo, useState} from 'react';
import {useConnections} from '../../api/store';
import {connectionDetails, connectionRows, connectionStates, ipLiteral} from '../../api/selectors';
import {Button, Kv, LabeledSelect, Light, MenuButton, Segmented, TextField} from '../../ui/ui';
import {ConnectionTable} from './ConnectionTable';
import type {PageProps} from '../types';
import {useT, useLang, LOCALE} from '../../i18n';
import {columns, readView, viewKey, type ConnectionView} from './view';

export function Connections({go, query}: PageProps) {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
  const [view, setView] = useState(readView);
  const updateView = (patch: Partial<ConnectionView>) => {
    const next = {...view, ...patch};
    setView(next);
    try {
      localStorage.setItem(viewKey, JSON.stringify(next));
    } catch {
      // Keep the controls usable when storage is unavailable.
    }
  };
  const q = useMemo(() => new URLSearchParams(query), [query]);
  const [text, setText] = useState(q.get('q') ?? q.get('src') ?? '');
  const [network, setNetwork] = useState('all');
  const [out, setOut] = useState('all');
  const [sel, setSel] = useState<string | null>(q.get('id') ?? '2');
  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    const text = q.get('q') ?? q.get('src');
    const id = q.get('id');
    if (text !== null) setText(text);
    if (id !== null) {
      setSel(id);
      if (text === null) setText('');
      setNetwork('all');
      setOut('all');
    }
  }
  const src = ipLiteral(text);
  const resource = useConnections(src);
  const rows = useMemo(() => connectionRows(resource.data), [resource.data]);
  const needle = text.trim().toLowerCase();
  const shown = rows.filter(
    c =>
      (network === 'all' || c.network === network) &&
      (out === 'all' || c.outbound === out) &&
      (src || !needle || [c.dst, c.domain, c.src, c.pname, c.outbound, c.chain.join(' '), c.rule_expression].join(' ').toLowerCase().includes(needle))
  );
  const cur = shown.find(c => c.id === sel);
  const outbounds = [...new Set(rows.flatMap(c => (c.outbound ? [c.outbound] : [])))];
  return (
    <div className="rp-page">
      {resource.error && (
        <p role="alert" className="rp-note">
          {t('conn.loadFailed', {error: resource.error.message})}
        </p>
      )}
      {resource.loading && !resource.data && <p role="status">{t('ui.loading')}</p>}
      {resource.data?.truncated && <p className="rp-note">{t('conn.truncated')}</p>}
      <div className="rp-toolbar">
        <TextField search label={t('ui.filter')} value={text} onChange={setText} placeholder={t('conn.filterHint')} width={280} />
        <Segmented
          label={t('ui.network')}
          value={network}
          onChange={setNetwork}
          items={[
            ['all', t('ui.allCount', {n: rows.length})],
            ['tcp', t('ui.tcp')],
            ['udp', t('ui.udp')]
          ]}
        />
        <LabeledSelect
          label={t('ui.outbound')}
          side
          value={out}
          onChange={setOut}
          items={[{id: 'all', label: t('conn.allOutbounds')}, ...outbounds.map(id => ({id, label: id}))]}
        />
        <Button
          onPress={() => {
            setText('');
            setNetwork('all');
            setOut('all');
          }}
        >
          {t('ui.clearFilters')}
        </Button>
      </div>
      <div className="rp-toolbar">
        <MenuButton
          label={t('conn.columns')}
          multiple
          value={columns.filter(column => !view.hidden.includes(column.id)).map(column => column.id)}
          items={columns.map(column => ({id: column.id, label: t(column.label)}))}
          onChange={id => {
            const hidden = view.hidden.includes(id) ? view.hidden.filter(value => value !== id) : [...view.hidden, id];
            if (hidden.length < columns.length) updateView({hidden});
          }}
        >
          {t('conn.columns')}
        </MenuButton>
        <LabeledSelect
          label={t('conn.group')}
          side
          value={view.group}
          onChange={group => updateView({group: group as ConnectionView['group']})}
          items={[
            {id: 'none', label: t('conn.ungrouped')},
            {id: 'source', label: t('ui.source')},
            {id: 'outbound', label: t('ui.outbound')}
          ]}
        />
      </div>
      <div className="rp-page">
        <ConnectionTable rows={shown} selected={sel} onSelect={setSel} view={view} onSort={sort => updateView({sort})} />
        {cur ? (
          <div className="rp-card">
            <h3 className="rp-h3">{cur.domain || cur.dst || cur.id}</h3>
            <Light small tone={cur.state === 'blocked' || cur.state === 'failed' ? 'err' : cur.state === 'active' ? 'ok' : 'info'}>
              {t(connectionStates[cur.state])} · {cur.network.toUpperCase()}
            </Light>
            <Kv items={connectionDetails(cur, locale).map(([key, value]) => [t(key), value])} />
            <Button onPress={() => go('flows', cur.flow_id ? 'id=' + encodeURIComponent(cur.flow_id) : 'connection_id=' + encodeURIComponent(cur.id))}>
              {t('conn.viewFlow')}
            </Button>
          </div>
        ) : (
          <div className="rp-card">
            <span className="rp-label">{t('conn.pick')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
