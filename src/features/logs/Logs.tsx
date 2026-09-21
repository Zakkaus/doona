import {useT} from '../../i18n';
import {Button, DataTable, ErrorMessage, LabeledSelect, Light, Switch, TextField, TextTooltip, Empty} from '../../ui/ui';
import {useLogs} from './useLogs';
import Download from '../../ui/icons/Download';

export function Logs() {
  const t = useT();
  const vm = useLogs();
  if (vm.unavailable)
    return (
      <div className="rp-page">
        <Empty>{t('log.unavailable')}</Empty>
      </div>
    );
  return (
    <div className="rp-page">
      <div className="rp-toolbar">
        <LabeledSelect side label={t('log.level')} value={vm.level} onChange={vm.setLevel} items={vm.levels} />
        <TextField search label={t('log.target')} value={vm.target} width={220} placeholder={t('log.targetPlaceholder')} onChange={vm.setTarget} />
        <Switch isSelected={vm.paused} onChange={vm.setPaused}>
          {t('log.pause')}
        </Switch>
        <Light small tone={vm.status.tone}>
          {vm.status.text}
        </Light>
        <span className="rp-grow" />
        <Button small isDisabled={!vm.rows.length} onPress={vm.clear}>
          {t('log.clear')}
        </Button>
        <Button isDisabled={!vm.rows.length} onPress={vm.export}>
          <Download />
          {t('log.export')}
        </Button>
      </div>
      <ErrorMessage error={vm.error} />
      <DataTable
        label={t('nav.logs')}
        rows={vm.rows}
        height={640}
        loading={vm.loading}
        empty={t('log.empty')}
        cols={[
          {id: 'ts', label: t('ui.time'), minWidth: 180, grow: 0, render: record => <span className="rp-code">{record.timestamp}</span>},
          {
            id: 'level',
            label: t('log.level'),
            minWidth: 90,
            grow: 0,
            render: record => (
              <Light small tone={record.tone}>
                {record.levelText}
              </Light>
            )
          },
          {id: 'target', label: t('log.target'), minWidth: 160, grow: 0, drop: 1, render: record => <span className="rp-code">{record.target}</span>},
          {
            id: 'message',
            label: t('log.message'),
            minWidth: 280,
            grow: 3,
            isRowHeader: true,
            render: record => <TextTooltip text={record.tooltip}>{record.message}</TextTooltip>
          }
        ]}
      />
    </div>
  );
}
