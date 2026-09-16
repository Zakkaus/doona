import {useT} from '../../i18n';
import type {Key} from '../../i18n/messages';
// Validation page: everything Config::validate collected about the on-disk revision, what the runtime does with each
// finding, and what differs from the running revision. Editing lives on the config page.
import {useState} from 'react';
import Refresh from '../../ui/icons/Refresh';
import {diagnostics, pending, restartItems, runtime, sources, type Diag} from './fixtures';
import {Badge, Button, DataTable, Light, Segmented, toast} from '../../ui/ui';
import type {PageProps} from '../types';

const LEVEL: Record<Diag['level'], {tone: 'err' | 'warn' | 'info'; label: Key}> = {
  error: {tone: 'err', label: 'ui.error'},
  warn: {tone: 'warn', label: 'ui.warning'},
  info: {tone: 'info', label: 'ui.notice'}
};
const where = (d: Diag) =>
  (sources
    .find(s => s.id === d.source)
    ?.path.split('/')
    .pop() ?? d.source) +
  ':' +
  d.line;

export function Validate({go}: PageProps) {
  const t = useT();
  const [filter, setFilter] = useState('all');
  const [sel, setSel] = useState<string | null>(null);
  const errors = diagnostics.filter(d => d.level === 'error').length;
  const warns = diagnostics.filter(d => d.level === 'warn').length;
  const rows = filter === 'all' ? diagnostics : diagnostics.filter(d => d.level === filter);
  const cur = diagnostics.find(d => d.id === sel);
  const needRestart = pending.filter(p => p.restart);
  const open = (d: Diag) =>
    go(
      'config',
      'src=' +
        (sources
          .find(s => s.id === d.source)
          ?.path.split('/')
          .pop() ?? '') +
        '&line=' +
        d.line
    );
  return (
    <div className="rp-page">
      <p className="rp-note">{t('compat.demoData')}</p>
      <div className="rp-toolbar">
        <Light tone={errors ? 'err' : warns ? 'warn' : 'ok'}>
          {errors ? t('validate.failed', {errors, warnings: warns}) : warns ? t('validate.warnings', {n: warns}) : t('validate.passed')}
        </Light>
        <Badge>{t('ui.diskRevision', {n: runtime.diskRevision})}</Badge>
        <Badge>{t('ui.activeRevision', {n: runtime.activeRevision})}</Badge>
        <span className="rp-grow" />
        <Button primary onPress={() => toast('neutral', t('compat.disconnected'))}>
          <Refresh />
          {t('validate.again')}
        </Button>
      </div>
      <p className="rp-note">{t('validate.note')}</p>
      <div className="rp-split">
        <div className="rp-col">
          <div className="rp-between">
            <Segmented
              label={t('validate.level')}
              value={filter}
              onChange={setFilter}
              items={[
                ['all', t('ui.allCount', {n: diagnostics.length})],
                ['error', t('validate.errors', {n: errors})],
                ['warn', t('validate.warns', {n: warns})],
                ['info', t('validate.infos', {n: diagnostics.length - errors - warns})]
              ]}
            />
          </div>
          <DataTable
            label={t('validate.results')}
            height={360}
            rows={rows}
            selected={sel}
            onSelect={setSel}
            empty={t('validate.empty')}
            cols={[
              {id: 'level', label: t('validate.level'), width: 88},
              {id: 'where', label: t('ui.position'), width: 140},
              {id: 'msg', label: t('validate.message'), isRowHeader: true},
              {id: 'action', label: t('validate.action'), width: 96}
            ]}
            render={d => [
              <Light small tone={LEVEL[d.level].tone}>
                {t(LEVEL[d.level].label)}
              </Light>,
              <span className="rp-code">{where(d)}</span>,
              d.msg,
              d.action
            ]}
          />
        </div>
        <div className="rp-col">
          {cur && (
            <div className="rp-card">
              <div className="rp-row">
                <Light tone={LEVEL[cur.level].tone}>{t(LEVEL[cur.level].label)}</Light>
                <span className="rp-code">{where(cur)}</span>
              </div>
              <p className="rp-p">{cur.msg}</p>
              <span className="rp-label">{t('validate.why', {action: cur.action, reason: cur.why})}</span>
              <Button secondary onPress={() => open(cur)}>
                {t('ui.openSource')}
              </Button>
            </div>
          )}
          <div className="rp-card">
            <div className="rp-row">
              <h3 className="rp-h3">{t('validate.diff')}</h3>
              <span className="rp-label">
                r{runtime.activeRevision} → r{runtime.diskRevision}
              </span>
            </div>
            <div className="rp-list">
              {pending.map(p => (
                <div key={p.key} className="rp-row">
                  <span className="rp-code">{p.key}</span>
                  <span className="rp-note">
                    {p.from} → {p.to}
                  </span>
                  {p.restart && <Badge tone="warn">{t('ui.needRestart')}</Badge>}
                </div>
              ))}
            </div>
            <span className="rp-label">
              {needRestart.length ? t('validate.restartSummary', {n: needRestart.length, other: pending.length - needRestart.length}) : t('validate.reloadAll')}
            </span>
          </div>
          <div className="rp-card">
            <h3 className="rp-h3">{t('validate.restartItems')}</h3>
            <div className="rp-list">
              {restartItems.map(k => (
                <span key={k} className="rp-code">
                  {k}
                </span>
              ))}
            </div>
            <span className="rp-label">{t('validate.restartNote')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
