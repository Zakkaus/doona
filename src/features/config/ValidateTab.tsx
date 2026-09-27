import {useT} from '../../i18n';
import {DaeCode} from '../../ui/DaeCode';
import {Button, DataTable, Light, Segmented, TextTooltip} from '../../ui/ui';
import Refresh from '../../ui/icons/Refresh';
import {useValidateTab, type ValidateTabProps} from './useConfigPage';
export function ValidateTab(props: ValidateTabProps) {
  const {canValidate, open} = props;
  const t = useT();
  const {level, setLevel, selected, setSelected, shown, validate, summaryTone, summary, lastRun, validating, blocked, tip, levels} = useValidateTab(props);
  return (
    <>
      <div className="rp-toolbar">
        <Light small tone={summaryTone}>
          {summary}
        </Light>
        <span className="rp-label">{lastRun}</span>
        <span className="rp-grow" />
        {canValidate && (
          <Button isPending={validating} isDisabled={blocked} tip={tip} onPress={validate}>
            <Refresh className="rp-spin-on-press" />
            {t('config.revalidate')}
          </Button>
        )}
      </div>
      <span className="rp-label">{t('config.validateNote')}</span>
      <Segmented label={t('config.level')} value={level} onChange={setLevel} items={levels} />
      <DataTable
        label={t('config.diagnostics')}
        rows={shown}
        height={360}
        selected={selected}
        onSelect={setSelected}
        detail={cur => (
          <div className="rp-cluster rp-config-diagnostics">
            <Light small tone={cur.tone}>
              {cur.detail}
            </Light>
            <Button label={t('config.openSourceAt', {where: cur.where})} onPress={() => open(cur.sourceId, cur.line)}>
              {t('config.openSource')}
            </Button>
          </div>
        )}
        empty={t('config.noDiagnostics')}
        cols={[
          {
            id: 'level',
            label: t('config.level'),
            minWidth: 96,
            grow: 0,
            render: item => (
              <Light small tone={item.tone}>
                {item.levelText}
              </Light>
            )
          },
          {
            id: 'where',
            label: t('config.where'),
            minWidth: 150,
            grow: 0,
            render: item => <span className="rp-code">{item.where}</span>
          },
          {id: 'message', label: t('config.message'), minWidth: 240, grow: 2, isRowHeader: true, render: item => <TextTooltip>{item.message}</TextTooltip>},
          {id: 'code', label: t('config.code'), minWidth: 140, drop: 1, render: item => <DaeCode text={item.code} />}
        ]}
      />
    </>
  );
}
