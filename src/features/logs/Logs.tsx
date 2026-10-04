import {useCallback, useMemo} from 'react';
import {LogActivity} from './Activity';
import {useT} from '../../i18n';
import {ActionGroup, Button, DataTable, ErrorMessage, Kv, LabeledSelect, Light, Switch, TextField, TextTooltip, type TableColumn, Toolbar} from '../../ui/ui';
import {useLogs} from './useLogs';
import {logRowText} from './view';
import {useCopyRecord} from '../shared/useCopyRecord';
import Copy from '../../ui/icons/Copy';
import Download from '../../ui/icons/Download';
import type {PageProps} from '../../shell/routes';

type LogRow = ReturnType<typeof useLogs>['rows'][number];

export function Logs({go}: PageProps) {
  const t = useT();
  const vm = useLogs({go});
  const copy = useCopyRecord();
  // Stable column definitions: a new array on every stream tick would re-render every visible row.
  const columns = useMemo(
    (): TableColumn<LogRow>[] => [
      {
        id: 'ts',
        label: t('ui.time'),
        minWidth: 212,
        grow: 0,
        drop: 2,
        render: record =>
          !record.gap && (
            <TextTooltip className="rp-code" text={record.iso}>
              {record.timestamp}
            </TextTooltip>
          )
      },
      {
        id: 'level',
        label: t('log.level'),
        minWidth: 104,
        grow: 0,
        drop: 3,
        render: record =>
          !record.gap && (
            <Light small tone={record.tone}>
              {record.levelText}
            </Light>
          )
      },
      {id: 'target', label: t('log.target'), minWidth: 160, grow: 0, drop: 1, render: record => <span className="rp-code">{record.target ?? '—'}</span>},
      {
        id: 'message',
        label: t('log.message'),
        minWidth: 280,
        grow: 3,
        isRowHeader: true,
        render: record => <TextTooltip>{record.message}</TextTooltip>
      },
      {
        id: 'actions',
        actions: true,
        label: t('ui.actions'),
        hideLabel: true,
        minWidth: 64,
        grow: 0,
        render: record => (
          <Button small quiet icon label={t('ui.copyRecord')} onPress={() => void copy(logRowText(record))}>
            <Copy />
          </Button>
        )
      }
    ],
    [t, copy]
  );
  // The message column cuts a long message; a pressed row shows the whole record.
  const detail = useCallback(
    (record: LogRow) => (
      <Kv
        inline
        items={
          record.gap
            ? [[t('log.message'), record.message]]
            : [
                [t('ui.time'), record.timestamp],
                [t('log.level'), record.levelText],
                [t('log.target'), record.target ?? '—'],
                [t('log.message'), record.message]
              ]
        }
      />
    ),
    [t]
  );
  return (
    <div className="rp-page">
      <Toolbar page>
        <LabeledSelect side label={t('log.level')} value={vm.level} onChange={vm.setLevel} items={vm.levels} />
        {vm.filtersTarget && (
          <TextField search label={t('log.target')} value={vm.target} width={240} placeholder={t('log.targetPlaceholder')} onChange={vm.setTarget} />
        )}
        <Switch isSelected={vm.paused} onChange={vm.setPaused}>
          {t('log.pause')}
        </Switch>
        <Light small tone={vm.status.tone}>
          {vm.status.text}
        </Light>
        {vm.recordedText && <span className="rp-label">{vm.recordedText}</span>}
        <span className="rp-grow" />
        <ActionGroup
          actions={[
            {id: 'clear', label: t('log.clear'), isDisabled: !vm.rows.length, onAction: vm.clear},
            {id: 'export', label: t('log.export'), icon: <Download />, isDisabled: !vm.rows.length, onAction: vm.export},
            ...(vm.openRecording ? [{id: 'recording', label: t('ui.recordingSettings'), onAction: vm.openRecording}] : [])
          ]}
        />
      </Toolbar>
      <ErrorMessage error={vm.error} onRetry={vm.retry} />
      <LogActivity records={vm.records} offered={vm.offered} minimum={vm.level} setMinimum={vm.setLevel} />
      <DataTable label={t('nav.logs')} stream flow rows={vm.rows} loading={vm.loading} empty={vm.empty} cols={columns} detail={detail} />
    </div>
  );
}
