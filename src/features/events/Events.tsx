import {useMemo} from 'react';
import {useT} from '../../i18n';
import {Button, DataTable, LabeledSelect, Light, ErrorMessage, TextTooltip, type TableColumn} from '../../ui/ui';
import {useEvents} from './useEvents';
import Download from '../../ui/icons/Download';

type EventRow = ReturnType<typeof useEvents>['rows'][number];

export function Events() {
  const t = useT();
  const vm = useEvents();
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
          <TextTooltip className="rp-code" text={event.timeTooltip}>
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
        render: event => event.summary
      }
    ],
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
      <DataTable label={t('nav.events')} stream height={442} loading={vm.loading} rows={vm.rows} empty={t('event.empty')} cols={columns} />
    </div>
  );
}
