import {outboundModeHref} from '../shared/link';
import {useEffect, useId, useLayoutEffect, useMemo, useRef, type ReactNode} from 'react';
import {useT, type Translator} from '../../i18n';
import {DaeCode} from '../../ui/DaeCode';
import {SearchSelect} from '../../ui/SearchSelect';
import {
  ActionHelp,
  Badge,
  Button,
  Link,
  Card,
  HelpRow,
  DataTable,
  LabeledSelect,
  StaticField,
  Light,
  ConfirmDialog,
  DialogForm,
  DialogSection,
  Segmented,
  Switch,
  ErrorMessage,
  InlineAlert,
  TextField,
  TextTooltip,
  type TableColumn
} from '../../ui/ui';
import Close from '../../ui/icons/Close';
import Edit from '../../ui/icons/Edit';
import FileText from '../../ui/icons/FileText';
import type {RuleConditionKind} from '../../dae/groups';
import {Coverage} from '../shared/Coverage';
import type {PageProps} from '../../shell/routes';
import {useRuleList, type DictionaryModel, type RuleListModel as Model} from './useRuleList';
import {useRuleTemplates} from './useRuleTemplates';
import {RuleTemplates} from './RuleTemplates';

export function RuleList(props: PageProps) {
  const t = useT();
  const view = useRuleList(props);
  const templates = useRuleTemplates(props);
  if (view.kind !== 'dictionary') return <Distribution view={view} />;
  if (!templates.available) return <RuleDictionary view={view} />;
  // The view switch ends the list's toolbar row in both views, after the rule count and Add rule.
  const viewSwitch = (
    <Segmented
      label={t('rule.viewMode')}
      items={[
        ['simple', t('rule.viewSimple')],
        ['advanced', t('rule.viewAdvanced')]
      ]}
      value={templates.mode}
      onChange={templates.setMode}
    />
  );
  if (templates.mode === 'advanced') return <RuleDictionary view={view} viewSwitch={viewSwitch} />;
  return (
    <div className="rp-col">
      <div className="rp-toolbar">
        {view.table.caption && <span className="rp-label">{view.table.caption}</span>}
        <span className="rp-grow" />
        {viewSwitch}
      </div>
      <RuleTemplates model={templates} />
    </div>
  );
}
type Row = DictionaryModel['table']['rows'][number];
// Routing rules count their hits in flow records; DNS rules have no such count.
const hitsColumn = (t: Translator): TableColumn<Row> => ({
  id: 'hits',
  label: t('rule.hits'),
  minWidth: 60,
  grow: 0,
  align: 'end',
  drop: 1,
  render: row => row.hits
});
// One rule list with its add and remove dialogs; the routing list and each DNS list render through it.
export function RuleDictionary({view, viewSwitch}: {view: DictionaryModel; viewSwitch?: ReactNode}) {
  const t = useT();
  const {form, setForm, draft, dialog} = view;
  const mustHelpId = useId();
  // The row actions are new functions each render; a ref keeps the columns, and so the rows, stable.
  const latest = useRef(view);
  useLayoutEffect(() => {
    latest.current = view;
  });
  const {canWrite, busy} = view;
  const {target, hits} = view.copy;
  const editable = canWrite && !!view.openEdit;
  // A link to review the held rules moves focus, and so the view, to their section once it is shown.
  const heldRef = useRef<HTMLElement>(null);
  const reviewing = !!view.reviewHeld && !!view.held;
  useEffect(() => {
    if (reviewing) heldRef.current?.focus();
  }, [reviewing]);
  const columns = useMemo(
    (): TableColumn<Row>[] => [
      {id: 'n', label: t('rule.id'), minWidth: 44, grow: 0, drop: 3, render: row => row.number},
      {
        id: 'expression',
        text: 'wrap',
        label: t('rule.expression'),
        minWidth: 320,
        grow: 3,
        isRowHeader: true,
        render: row => <DaeCode text={row.expression} />
      },
      {
        id: 'outbound',
        label: target,
        minWidth: 100,
        grow: 0,
        drop: 4,
        render: row => (
          <span className="rp-chain">
            {row.outbound}
            {row.must && <Badge>must</Badge>}
          </span>
        )
      },
      {id: 'source', label: t('rule.where'), minWidth: 116, grow: 0, drop: 2, render: row => row.position},
      ...(hits ? [hitsColumn(t)] : []),
      {
        id: 'actions',
        label: t('ui.actions'),
        minWidth: 136,
        grow: 0,
        render: row => (
          <span className="rp-chain">
            <span className="rp-action-slot">
              {row.sourceQuery && (!row.visual || !editable || row.editReason !== null) && (
                <Button small quiet icon label={t('rule.openSource')} onPress={() => latest.current.openSource(row.sourceQuery!)}>
                  <FileText />
                </Button>
              )}
            </span>
            <span className="rp-action-slot">
              {row.modeManaged && (
                <Link appearance="button" small quiet icon label={t('rule.editOutboundMode')} href={outboundModeHref}>
                  <Edit />
                </Link>
              )}
              {editable && !row.modeManaged && (
                <Button
                  small
                  quiet
                  icon
                  isDisabled={busy || row.editReason !== null}
                  tip={row.editReason ?? undefined}
                  label={t('rule.edit')}
                  onPress={() => latest.current.openEdit?.(row.id)}
                >
                  <Edit />
                </Button>
              )}
            </span>
            <span className="rp-action-slot">
              {canWrite && !row.modeManaged && (row.removable || row.removeReason) && (
                <Button
                  small
                  quiet
                  icon
                  isDisabled={busy || !row.removable}
                  tip={row.removeReason ?? undefined}
                  label={t('rule.remove')}
                  onPress={() => latest.current.openRemove(row.id)}
                >
                  <Close />
                </Button>
              )}
            </span>
          </span>
        )
      }
    ],
    [t, canWrite, editable, busy, target, hits]
  );
  // What the rule routes to, which both adding and editing a rule set.
  const targetFields = (
    <>
      <div className="rp-toolbar end">
        {view.table.outboundSections ? (
          <SearchSelect
            isDisabled={view.busy}
            label={target}
            searchLabel={t('ui.filterOutbounds')}
            value={form.outbound}
            onChange={outbound => setForm({...form, outbound})}
            sections={view.table.outboundSections}
          />
        ) : (
          <LabeledSelect
            isDisabled={view.busy}
            label={target}
            value={form.outbound}
            onChange={outbound => setForm({...form, outbound})}
            items={view.table.outbounds}
          />
        )}
        {view.copy.must && (
          <Switch isDisabled={view.busy} isSelected={form.must} onChange={must => setForm({...form, must})} aria-describedby={mustHelpId}>
            {t('rule.must')} <code>must</code>
          </Switch>
        )}
      </div>
      {view.copy.must && (
        <span id={mustHelpId} className="rp-label">
          {t('rule.mustHelp')}
        </span>
      )}
    </>
  );
  const conditionFields = (
    <DialogForm onSubmit={event => event.preventDefault()}>
      {view.conditions?.map(row => (
        <DialogSection key={row.id}>
          <LabeledSelect
            isDisabled={view.busy}
            label={t('rule.kind')}
            value={row.kind}
            onChange={kind => view.setCondition(row.id, {...row, kind: kind as RuleConditionKind})}
            items={row.draft.choices}
          />
          <TextField
            isDisabled={view.busy}
            label={t('rule.values')}
            value={row.value}
            placeholder={row.draft.hint}
            description={t('rule.valuesHelp')}
            error={row.draft.pickError}
            spellCheck={false}
            onChange={value => view.setCondition(row.id, {...row, value})}
          />
          <div className="rp-toolbar">
            <Switch isDisabled={view.busy} isSelected={row.negate} onChange={negate => view.setCondition(row.id, {...row, negate})}>
              {t('rule.negate')}
            </Switch>
            <span className="rp-grow" />
            <Button small isDisabled={view.busy || view.conditions!.length === 1} onPress={() => view.removeCondition(row.id)}>
              {t('rule.removeCondition')}
            </Button>
          </div>
        </DialogSection>
      ))}
      <div className="rp-toolbar">
        <Button small isDisabled={view.busy} onPress={view.addCondition}>
          {t('rule.addCondition')}
        </Button>
      </div>
    </DialogForm>
  );
  return (
    <div className="rp-col">
      <ActionHelp reason={view.canWrite ? view.addReason : null}>
        <div className="rp-toolbar">
          {view.table.caption && <span className="rp-label">{view.table.caption}</span>}
          <span className="rp-grow" />
          {view.canWrite && (
            <Button isDisabled={view.addDisabled} tip={view.addTip} onPress={view.openAdd}>
              {t('rule.add')}
            </Button>
          )}
          {viewSwitch}
        </div>
      </ActionHelp>
      {view.held && (
        <Card className="rp-list" aria-label={view.held.title} ref={heldRef} tabIndex={-1}>
          <div className="rp-cluster">
            <h2 className="rp-h3">{view.held.title}</h2>
            {view.held.files && <span className="rp-label">{view.held.files}</span>}
            {view.held.elsewhere && <span className="rp-label">{view.held.elsewhere}</span>}
            <span className="rp-grow" />
            {view.applyHeld && (
              <Button small isPending={view.applying} onPress={view.applyHeld}>
                {t('rule.applyHeld')}
              </Button>
            )}
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
              <Button small quiet icon label={t('rule.discard')} isDisabled={view.applying} onPress={() => view.discard(row.id)}>
                <Close />
              </Button>
            </div>
          ))}
        </Card>
      )}
      <ErrorMessage error={view.error} onRetry={view.retry} />
      <DataTable
        label={view.copy.label}
        loading={view.loading}
        rows={view.table.rows}
        selected={view.selected}
        reveal
        onSelect={view.select}
        height={560}
        fit
        empty={view.copy.empty}
        cols={columns}
      />
      <ConfirmDialog
        scrollBody
        title={view.dialogTitle}
        isOpen={dialog !== null}
        onCancel={view.close}
        tone={dialog?.kind === 'remove' ? 'negative' : 'accent'}
        confirmLabel={view.submitLabel}
        isDisabled={view.submitDisabled}
        reason={view.submitReason}
        isPending={view.busy}
        onConfirm={() => void view.submit(view.close)}
      >
        {dialog?.kind === 'remove' && (
          <div className="rp-list">
            <span className="rp-label">{dialog.help}</span>
            <DaeCode text={dialog.expression} />
          </div>
        )}
        {dialog?.kind === 'edit' && (
          <div className="rp-list">
            <span className="rp-label">{t(dialog.fallback ? 'rule.editFallbackHelp' : view.conditions ? 'rule.editHelp' : 'rule.editExpressionHelp')}</span>
            <DaeCode text={dialog.expression} />
            {!dialog.fallback &&
              (view.conditions ? (
                conditionFields
              ) : (
                <TextField
                  isDisabled={view.busy}
                  label={t('rule.expression')}
                  value={form.condition}
                  isInvalid={draft.rawInvalid}
                  spellCheck={false}
                  onChange={condition => setForm({...form, condition})}
                />
              ))}
            {targetFields}
          </div>
        )}
        {dialog?.kind === 'add' && (
          <div className="rp-list">
            <span className="rp-label">{draft.mode === 'pick' ? view.copy.addHelp : t('rule.addExpressionHelp')}</span>
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
            {draft.mode === 'pick' ? (
              <>
                {conditionFields}
                {draft.preview && <DaeCode text={draft.preview} />}
              </>
            ) : (
              <TextField
                isDisabled={view.busy}
                label={t('rule.condition')}
                value={form.condition}
                placeholder={view.copy.placeholder}
                description={view.expressionHint ?? undefined}
                isInvalid={draft.rawInvalid}
                spellCheck={false}
                onChange={condition => setForm({...form, condition})}
              />
            )}
            {targetFields}
            {view.table.positions.length === 1 ? (
              <StaticField label={t('rule.position')} value={view.table.positions[0].label} description={view.table.positions[0].desc} />
            ) : (
              <SearchSelect
                isDisabled={view.busy}
                label={t('rule.position')}
                searchLabel={t('ui.filterPositions')}
                value={form.before}
                onChange={before => setForm({...form, before})}
                sections={view.table.positionSections}
              />
            )}
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
        text: 'wrap',
        label: t('rule.expression'),
        minWidth: 240,
        grow: 3,
        isRowHeader: true,
        render: row => (row.expressionClass ? <DaeCode text={row.expression} /> : row.expression)
      },
      {id: 'source', label: t('rule.distributionSource'), minWidth: 120, grow: 0, drop: 1, render: row => <Badge>{row.source}</Badge>},
      {id: 'hits', label: t('rule.hits'), minWidth: 72, grow: 0, align: 'end', render: row => row.hits},
      {id: 'share', label: t('rule.share'), minWidth: 72, grow: 0, align: 'end', drop: 3, render: row => row.share}
    ],
    [t]
  );
  return (
    <div className="rp-col">
      <div className="rp-toolbar">
        <HelpRow help={table.sourceHelp}>
          <Segmented label={t('rule.distributionSource')} value={view.source} onChange={view.setSource} items={table.choices} />
        </HelpRow>
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
      <DataTable label={t('rule.listTitle')} loading={view.loading} rows={table.rows} fit empty={table.empty} cols={columns} />
    </div>
  );
}
