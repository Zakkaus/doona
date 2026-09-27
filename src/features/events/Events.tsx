import {useCallback, useMemo} from 'react';
import {useT} from '../../i18n';
import {Button, DataTable, HelpRow, LabeledSelect, Light, ErrorMessage, TextTooltip, type TableColumn, Kv} from '../../ui/ui';
import {useEventsPage} from './useEventsPage';
import Download from '../../ui/icons/Download';

type EventRow = ReturnType<typeof useEventsPage>['rows'][number];

export function Events() {
  const t = useT();
  const vm = useEventsPage();
  // Stable column definitions: a new array on every stream tick would re-render every visible row.
  const columns = useMemo(
    (): TableColumn<EventRow>[] => [
      {
        id: 't',
        label: t('ui.time'),
        minWidth: 200,
        grow: 0,
        drop: 1,
        render: event => (
          <TextTooltip className="rp-code" text={event.iso}>
            {event.timestamp}
          </TextTooltip>
        )
      },
      {id: 'k', label: t('event.kind'), minWidth: 168, drop: 2, render: event => <TextTooltip text={event.kind}>{event.kindText}</TextTooltip>},
      {
        id: 'm',
        label: t('event.summary'),
        minWidth: 240,
        isRowHeader: true,
        render: event => (
          <HelpRow fill help={event.help}>
            {event.summary}
          </HelpRow>
        )
      }
    ],
    [t]
  );
  // A phone keeps only the summary column and cuts it; a pressed row shows the whole event.
  const detail = useCallback(
    (event: EventRow) => (
      <Kv
        inline
        items={[
          [t('ui.time'), event.timestamp],
          [t('event.kind'), event.kindText],
          [t('event.summary'), event.summary]
        ]}
      />
    ),
    [t]
  );
  return (
    <div className="rp-page">
      <div className="rp-toolbar">
        <LabeledSelect label={t('event.kind')} side value={vm.kind} onChange={vm.setKind} items={vm.kinds} />
        <Light small tone={vm.status.tone}>
          {vm.status.text}
        </Light>
        {vm.cursor && (
          <TextTooltip text={vm.cursor}>
            <span className="rp-label">{t('event.cursor')}</span>
          </TextTooltip>
        )}
        <span className="rp-label">{vm.limitText}</span>
        <span className="rp-grow" />
        <Button isDisabled={!vm.rows.length} onPress={vm.export}>
          <Download />
          {t('event.export')}
        </Button>
      </div>
      {vm.error && <ErrorMessage error={vm.error} onRetry={vm.retry} />}
      <DataTable label={t('nav.events')} stream fit height={442} loading={vm.loading} rows={vm.rows} empty={t('event.empty')} cols={columns} detail={detail} />
    </div>
  );
}
