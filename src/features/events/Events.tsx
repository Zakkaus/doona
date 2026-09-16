import {useT, useLang, LOCALE} from '../../i18n';
import {useState} from 'react';
import {useEventFeed} from '../../api/store';
import {eventKinds, eventSummary, localTime} from '../../api/selectors';
import {DataTable, LabeledSelect, Light, ErrorMessage, TextTooltip} from '../../ui/ui';

export function Events() {
  const t = useT();
  const locale = LOCALE[useLang()];
  const [kind, setKind] = useState('all');
  const feed = useEventFeed();
  const shown = feed.events.filter(event => kind === 'all' || event.event === kind);
  return (
    <div className="rp-page">
      <div className="rp-toolbar">
        <LabeledSelect
          label={t('event.kind')}
          side
          value={kind}
          onChange={setKind}
          items={[{id: 'all', label: t('event.allKinds')}, ...eventKinds.map(id => ({id, label: id}))]}
        />
        <Light small tone={feed.connected ? 'ok' : 'warn'}>
          {feed.available === false ? t('event.unavailable') : feed.connected ? t('event.connected') : t('event.reconnecting')}
        </Light>
        {feed.cursor && <span className="rp-code">{t('event.cursor', {cursor: feed.cursor})}</span>}
        <span className="rp-label">{t('event.limit')}</span>
      </div>
      {feed.error && <ErrorMessage error={feed.error} />}
      <DataTable
        label={t('nav.events')}
        height={442}
        loading={!feed.error && !feed.connected && feed.available !== false && !feed.events.length}
        rows={shown}
        empty={t('event.empty')}
        cols={[
          {id: 't', label: t('ui.time'), minWidth: 200, grow: 0},
          {id: 'k', label: t('event.kind'), minWidth: 168},
          {id: 'm', label: t('event.summary'), minWidth: 240, isRowHeader: true}
        ]}
        render={event => {
          const summary = eventSummary(event);
          return [
            <TextTooltip className="rp-code" text={event.data.observed_at}>
              {localTime(event.data.observed_at, locale)}
            </TextTooltip>,
            event.event,
            t(summary.key, summary.params)
          ];
        }}
      />
    </div>
  );
}
