import {useLayoutEffect, useMemo, useRef} from 'react';
import {useT} from '../../i18n';
import {DaeCode} from '../../ui/DaeCode';
import {
  Badge,
  Button,
  Card,
  DataTable,
  LabeledSelect,
  Light,
  ConfirmDialog,
  Segmented,
  Switch,
  ErrorMessage,
  InlineAlert,
  TextField,
  TextTooltip,
  type TableColumn
} from '../../ui/ui';
import Close from '../../ui/icons/Close';
import FileText from '../../ui/icons/FileText';
import type {ConditionKind} from '../../dae/groups';
import {Coverage} from './flows/Coverage';
import type {PageProps} from '../../shell/routes';
import {useRuleList, type RuleListModel as Model} from './useRuleList';

export function RuleList(props: PageProps) {
  const view = useRuleList(props);
  return view.kind === 'dictionary' ? <Dictionary view={view} /> : <Distribution view={view} />;
}
function Dictionary({view}: {view: Model}) {
  const t = useT();
  const {form, setForm, pick, setPick, draft, dialog} = view;
  // The row actions are new functions each render; a ref keeps the columns, and so the rows, stable.
  const latest = useRef(view);
  useLayoutEffect(() => {
    latest.current = view;
  });
  const {canWrite, busy} = view;
  const columns = useMemo(
    (): TableColumn<Model['table']['rows'][number]>[] => [
      {id: 'n', label: t('rule.id'), minWidth: 44, grow: 0, drop: 3, render: row => row.number},
      {
        id: 'expression',
        label: t('rule.expression'),
        minWidth: 160,
        grow: 3,
        isRowHeader: true,
        render: row => (
          <TextTooltip className="rp-code">
            <DaeCode text={row.expression} />
          </TextTooltip>
        )
      },
      {
        id: 'outbound',
        label: t('ui.outbound'),
        minWidth: 100,
        grow: 0,
        render: row => (
          <span className="rp-chain">
            {row.outbound}
            {row.must && <Badge>must</Badge>}
          </span>
        )
      },
      {id: 'source', label: t('rule.where'), minWidth: 116, grow: 0, drop: 2, render: row => row.position},
      {id: 'hits', label: t('rule.hits'), minWidth: 60, grow: 0, align: 'end', drop: 1, render: row => row.hits},
      {
        id: 'actions',
        label: t('ui.actions'),
        minWidth: canWrite ? 96 : 56,
        grow: 0,
        render: row => (
          <span className="rp-chain">
            {row.sourceQuery && (
              <Button small quiet icon label={t('rule.openSource')} onPress={() => latest.current.openSource(row.sourceQuery!)}>
                <FileText />
              </Button>
            )}
            {canWrite && row.removable && (
              <Button small quiet icon isDisabled={busy} label={t('rule.remove')} onPress={() => latest.current.openRemove(row.id)}>
                <Close />
              </Button>
            )}
          </span>
        )
      }
    ],
    [t, canWrite, busy]
  );
  return (
    <div className="rp-col">
      <div className="rp-toolbar">
        {view.table.caption && <span className="rp-label">{view.table.caption}</span>}
        <span className="rp-grow" />
        {view.canWrite && (
          <Button small isDisabled={view.addDisabled} onPress={view.openAdd}>
            {t('rule.add')}
          </Button>
        )}
      </div>
      {view.editHelp && <p className="rp-note">{view.editHelp}</p>}
      {view.held && (
        <Card className="rp-list" aria-label={view.held.title}>
          <div className="rp-cluster">
            <h3 className="rp-h3">{view.held.title}</h3>
            {view.held.files && <span className="rp-label">{view.held.files}</span>}
          </div>
          {view.held.failure && (
            <InlineAlert>
              {view.held.failure.text}
              {view.held.failure.lines.map((line, i) => (
                <span key={i} className="rp-label">
                  {line}
                </span>
              ))}
            </InlineAlert>
          )}
          {view.held.rows.map(row => (
            <div key={row.id} className="rp-cluster">
              <DaeCode text={row.line} />
              <span className="rp-label">{row.position}</span>
              <span className="rp-grow" />
              <Button small quiet icon label={t('rule.discard')} onPress={() => view.discard(row.id)}>
                <Close />
              </Button>
            </div>
          ))}
        </Card>
      )}
      <ErrorMessage error={view.error} onRetry={view.retry} />
      <DataTable
        label={t('rule.listTitle')}
        loading={view.loading}
        rows={view.table.rows}
        selected={view.selected}
        reveal
        onSelect={view.select}
        height={560}
        fit
        empty={t('rule.dictionaryEmpty')}
        cols={columns}
      />
      <ConfirmDialog
        title={view.dialogTitle}
        isOpen={dialog !== null}
        onCancel={view.close}
        tone={dialog?.kind === 'remove' ? 'negative' : 'accent'}
        confirmLabel={view.submitLabel}
        isDisabled={view.submitDisabled}
        isPending={view.busy}
        onConfirm={() => void view.submit(view.close)}
      >
        {dialog?.kind === 'remove' && (
          <div className="rp-list">
            <span className="rp-label">{dialog.help}</span>
            <DaeCode text={dialog.expression} />
          </div>
        )}
        {dialog?.kind === 'add' && (
          <div className="rp-list">
            <span className="rp-label">{t('rule.addHelp')}</span>
            <Segmented
              isDisabled={view.busy}
              label={t('rule.conditionMode')}
              value={draft.mode}
              onChange={view.changeMode}
              items={[
                ['pick', t('rule.pick')],
                ['text', t('rule.expression')]
              ]}
            />
            {pick.on ? (
              <>
                <div className="rp-toolbar top">
                  <LabeledSelect
                    isDisabled={view.busy}
                    label={t('rule.kind')}
                    value={pick.kind}
                    onChange={kind => setPick({...pick, kind: kind as ConditionKind})}
                    items={draft.choices}
                  />
                  <TextField
                    isDisabled={view.busy}
                    label={t('rule.values')}
                    value={pick.value}
                    placeholder={draft.hint}
                    description={t('rule.valuesHelp')}
                    error={draft.pickError}
                    spellCheck={false}
                    onChange={value => setPick({...pick, value})}
                  />
                </div>
                {draft.preview && <DaeCode text={draft.preview} />}
              </>
            ) : (
              <TextField
                isDisabled={view.busy}
                label={t('rule.condition')}
                value={form.condition}
                placeholder="domain(geosite:netflix)"
                isInvalid={draft.rawInvalid}
                spellCheck={false}
                onChange={condition => setForm({...form, condition})}
              />
            )}
            <div className="rp-toolbar">
              <LabeledSelect
                isDisabled={view.busy}
                label={t('ui.outbound')}
                value={form.outbound}
                onChange={outbound => setForm({...form, outbound})}
                items={view.table.outbounds}
              />
              <Switch isDisabled={view.busy} isSelected={form.must} onChange={must => setForm({...form, must})}>
                {t('rule.must')} <code>must</code>
              </Switch>
            </div>
            <LabeledSelect
              isDisabled={view.busy}
              label={t('rule.position')}
              value={form.before}
              onChange={before => setForm({...form, before})}
              items={view.table.positions}
            />
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
function Distribution({view}: {view: Model}) {
  const t = useT();
  const table = view.distribution;
  const columns = useMemo(
    (): TableColumn<Model['distribution']['rows'][number]>[] => [
      {id: 'n', label: t('rule.id'), minWidth: 72, grow: 0, drop: 2, render: row => row.ruleId},
      {
        id: 'expression',
        label: t('rule.expression'),
        minWidth: 240,
        grow: 3,
        isRowHeader: true,
        render: row => <TextTooltip className={row.expressionClass}>{row.expressionClass ? <DaeCode text={row.expression} /> : row.expression}</TextTooltip>
      },
      {id: 'source', label: t('rule.distributionSource'), minWidth: 96, grow: 0, drop: 1, render: row => <Badge>{row.source}</Badge>},
      {id: 'hits', label: t('rule.hits'), minWidth: 72, grow: 0, align: 'end', render: row => row.hits},
      {id: 'share', label: t('rule.share'), minWidth: 72, grow: 0, align: 'end', drop: 3, render: row => row.share}
    ],
    [t]
  );
  return (
    <div className="rp-col">
      <div className="rp-toolbar">
        <Segmented label={t('rule.distributionSource')} value={view.source} onChange={view.setSource} items={table.choices} />
        {table.caption && (
          <TextTooltip text={t('rule.distributionScope')} className="rp-label">
            {table.caption}
          </TextTooltip>
        )}
        {table.coverage && <Coverage view={table.coverage} />}
        {table.droppedUnknown && (
          <Light small tone="warn">
            {t('rule.droppedUnknown')}
          </Light>
        )}
      </div>
      <ErrorMessage error={view.error} onRetry={view.retry} />
      <DataTable label={t('rule.listTitle')} loading={view.loading} rows={table.rows} fit empty={t('rule.distributionEmpty')} cols={columns} />
    </div>
  );
}
