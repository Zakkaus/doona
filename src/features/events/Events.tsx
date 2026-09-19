import {useT, useLang, LOCALE, formatNumber} from '../../i18n';
import {useState} from 'react';
import {EVENT_FEED_LIMIT, useEventFeed} from '../../api/store';
import {eventKindLabels, eventKinds, eventSummary, localTime} from '../../api/selectors';
import {Button, DataTable, LabeledSelect, Light, ErrorMessage, TextTooltip, downloadFile, exportName} from '../../ui/ui';
import Download from '../../ui/icons/Download';

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
          items={[{id: 'all', label: t('event.allKinds')}, ...eventKinds.map(id => ({id, label: t(eventKindLabels[id])}))]}
        />
        <Light small tone={feed.connected ? 'ok' : 'warn'}>
          {feed.available === false ? t('event.unavailable') : feed.connected ? t('event.connected') : t('event.reconnecting')}
        </Light>
        {feed.cursor && (
          <TextTooltip text={feed.cursor}>
            <span className="rp-label">{t('event.cursor')}</span>
          </TextTooltip>
        )}
        <span className="rp-label">{t('event.limit', {n: formatNumber(EVENT_FEED_LIMIT, locale)})}</span>
        <span className="rp-grow" />
        <Button
          isDisabled={!shown.length}
          onPress={() => downloadFile(exportName('doona-events', 'json'), JSON.stringify(shown, null, 2) + '\n', 'application/json')}
        >
          <Download />
          {t('event.export')}
        </Button>
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
          const summary = eventSummary(event, t);
          return [
            <TextTooltip className="rp-code" text={event.data.observed_at}>
              {localTime(event.data.observed_at, locale)}
            </TextTooltip>,
            <TextTooltip text={event.event}>{t(eventKindLabels[event.event])}</TextTooltip>,
            t(summary.key, summary.params)
          ];
        }}
      />
    </div>
  );
}
