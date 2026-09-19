import {useState} from 'react';
import {useT, useLang, LOCALE} from '../../i18n';
import type {Key} from '../../i18n/messages';
import {useCapabilities, useLogFeed} from '../../api/store';
import type {LogLevel} from '../../api/model';
import {localTime} from '../../api/selectors';
import {Button, DataTable, ErrorMessage, LabeledSelect, Light, Switch, TextField, TextTooltip, downloadFile, exportName, useDebounced} from '../../ui/ui';
import Download from '../../ui/icons/Download';

const tones: Record<LogLevel, 'muted' | 'neutral' | 'info' | 'warn' | 'err'> = {trace: 'muted', debug: 'neutral', info: 'info', warn: 'warn', error: 'err'};
const labels: Record<LogLevel, Key> = {
  trace: 'log.level.trace',
  debug: 'log.level.debug',
  info: 'log.level.info',
  warn: 'log.level.warn',
  error: 'log.level.error'
};

// The engine's log as it happens: level floor and module prefix filter server-side, pause to read, export what
// is on screen. The replay ring fills the list on connect; the runtime settings page sizes that ring.
export function Logs() {
  const t = useT();
  const locale = LOCALE[useLang()];
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const [level, setLevel] = useState<LogLevel>('info');
  const [target, setTarget] = useState('');
  // The module filter restarts the stream, so it follows the field only after typing pauses.
  const targetFilter = useDebounced(target.trim(), 300);
  const [paused, setPaused] = useState(false);
  const feed = useLogFeed({level, target: targetFilter, paused});
  const levels = resources?.logs.levels ?? ['trace', 'debug', 'info', 'warn', 'error'];
  if (resources && !resources.logs.available)
    return (
      <div className="rp-page">
        <span className="rp-empty">{t('log.unavailable')}</span>
      </div>
    );
  return (
    <div className="rp-page">
      <div className="rp-toolbar">
        <LabeledSelect
          side
          label={t('log.level')}
          value={level}
          onChange={value => setLevel(value as LogLevel)}
          items={levels.map(id => ({id, label: t(labels[id])}))}
        />
        <TextField search label={t('log.target')} value={target} width={220} placeholder={t('log.targetPlaceholder')} onChange={setTarget} />
        <Switch isSelected={paused} onChange={setPaused}>
          {t('log.pause')}
        </Switch>
        <Light small tone={feed.connected ? 'ok' : 'warn'}>
          {feed.connected ? t('log.connected') : t('log.reconnecting')}
        </Light>
        <span className="rp-grow" />
        <Button small isDisabled={!feed.records.length} onPress={feed.clear}>
          {t('log.clear')}
        </Button>
        <Button
          isDisabled={!feed.records.length}
          onPress={() =>
            downloadFile(
              exportName('honk-log', 'txt'),
              [...feed.records]
                .reverse()
                .map(r => `${r.ts} ${r.level.toUpperCase().padEnd(5)} ${r.target} ${r.message}${r.fields ? ' ' + JSON.stringify(r.fields) : ''}`)
                .join('\n') + '\n',
              'text/plain;charset=utf-8'
            )
          }
        >
          <Download />
          {t('log.export')}
        </Button>
      </div>
      <ErrorMessage error={capabilities.error ?? feed.error} />
      <DataTable
        label={t('nav.logs')}
        rows={feed.records}
        height={640}
        loading={!capabilities.error && !feed.error && !feed.connected && !feed.records.length}
        empty={t('log.empty')}
        cols={[
          {id: 'ts', label: t('ui.time'), minWidth: 180, grow: 0},
          {id: 'level', label: t('log.level'), minWidth: 90, grow: 0},
          {id: 'target', label: t('log.target'), minWidth: 160, grow: 0, drop: 1},
          {id: 'message', label: t('log.message'), minWidth: 280, grow: 3, isRowHeader: true}
        ]}
        render={record => [
          <span className="rp-code">{localTime(record.ts, locale)}</span>,
          <Light small tone={tones[record.level]}>
            {t(labels[record.level])}
          </Light>,
          <span className="rp-code">{record.target}</span>,
          <TextTooltip text={record.fields ? JSON.stringify(record.fields) : undefined}>
            {record.message}
            {record.fields
              ? ' ' +
                Object.entries(record.fields)
                  .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
                  .join(' ')
              : ''}
          </TextTooltip>
        ]}
      />
    </div>
  );
}
