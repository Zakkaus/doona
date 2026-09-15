import {useMemo, useState} from 'react';
import {SearchField, Input, Button as RButton} from 'react-aria-components';
import Search from '../../ui/icons/Search';
import Close from '../../ui/icons/Close';
import {useConnections} from '../../api/store';
import {chainLabel, connectionDetails, connectionRows, connectionStates, ipLiteral, relativeStart} from '../../api/selectors';
import {formatBytes} from '../../api/u64';
import {Button, DataTable, Kv, LabeledSelect, Light, Segmented} from '../../ui/ui';
import {RuleDialog} from '../activity/RuleDialog';
import type {PageProps} from '../types';
import {useT, useLang, LOCALE} from '../../i18n';

export function Connections({go, query}: PageProps) {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
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
    if (id !== null) setSel(id);
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
        <SearchField aria-label={t('ui.filter')} value={text} onChange={setText} className="rp-input" style={{width: 280}}>
          <Search />
          <Input placeholder={t('conn.filterHint')} />
          <RButton className="clear" aria-label={t('clear')}>
            <Close />
          </RButton>
        </SearchField>
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
      <div className="rp-page">
        <DataTable
          label={t('nav.connections')}
          rows={shown}
          selected={sel}
          onSelect={setSel}
          empty={t('conn.empty')}
          cols={[
            {id: 'dst', label: t('ui.target'), width: 200, isRowHeader: true},
            {id: 'src', label: t('ui.source'), width: 136},
            {id: 'chain', label: t('conn.chain'), width: 180},
            {id: 'rule', label: t('conn.rule'), width: 220},
            {id: 'state', label: t('ui.state'), width: 100},
            {id: 'down', label: t('ui.download'), width: 88, align: 'end'},
            {id: 'age', label: t('ui.started'), width: 104, align: 'end'}
          ]}
          render={c => [
            c.domain || c.dst || '—',
            <span className="rp-code">{c.src ?? '—'}</span>,
            chainLabel(c),
            <span className="rp-rule">
              <span title={c.rule_expression ?? undefined}>{c.rule_expression ?? '—'}</span>
              {c.rule_source === 'recomputed' ? (
                <small className="rp-provenance">{t('conn.recomputed')}</small>
              ) : c.rule_source === 'unknown' ? (
                <small className="rp-provenance">—</small>
              ) : null}
            </span>,
            t(connectionStates[c.state]),
            formatBytes(c.download_bytes),
            relativeStart(c.started_at, locale)
          ]}
        />
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
            <RuleDialog
              trigger={<Button accent>{t('ui.addRule')}</Button>}
              presets={[
                ...(cur.domain ? [{label: t('ui.domainValue', {domain: cur.domain}), cond: 'domain(full: ' + cur.domain + ')'}] : []),
                ...(cur.dst ? [{label: t('conn.dstIp'), cond: 'dip(' + cur.dst.replace(/:\d+$/, '').replace(/^\[|\]$/g, '') + ')'}] : []),
                ...(cur.src ? [{label: t('ui.sourceValue', {source: cur.src}), cond: 'sip(' + cur.src + ')'}] : [])
              ]}
            />
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
