import {outboundModeHref} from '../shared/link';
import {useEffect, useLayoutEffect, useMemo, useRef, type ReactNode} from 'react';
import {useLandingHighlight} from '../../ui/hooks';
import {useT, type Translator} from '../../i18n';
import {DaeCode} from '../../ui/DaeCode';
import {
  ActionHelp,
  Badge,
  Button,
  Link,
  Card,
  HelpRow,
  DataTable,
  Light,
  Segmented,
  ErrorMessage,
  InlineAlert,
  TextTooltip,
  type TableColumn,
  Toolbar
} from '../../ui/ui';
import Close from '../../ui/icons/Close';
import Edit from '../../ui/icons/Edit';
import FileText from '../../ui/icons/FileText';
import {Coverage} from '../shared/Coverage';
import type {PageProps} from '../../shell/routes';
import {useRuleList, type DictionaryModel, type RuleListModel as Model} from './useRuleList';
import {useRuleTemplates} from './useRuleTemplates';
import {RuleTemplates} from './RuleTemplates';
import {RuleDialogs} from './RuleDialogs';

export function RuleList(props: PageProps) {
  const t = useT();
  const templates = useRuleTemplates(props);
  const view = useRuleList(props, templates.available && templates.mode === 'simple');
  const dictionary = view.kind === 'dictionary';
  if (!templates.available) return dictionary ? <RuleDictionary view={view} /> : <Distribution view={view} />;
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
  if (templates.mode === 'advanced')
    return dictionary ? <RuleDictionary view={view} viewSwitch={viewSwitch} /> : <Distribution view={view} viewSwitch={viewSwitch} />;
  return (
    <div className="rp-col">
      <Toolbar page>
        {view.table.caption && <span className="rp-label">{view.table.caption}</span>}
        <span className="rp-grow" />
        {viewSwitch}
      </Toolbar>
      <ErrorMessage error={view.error} onRetry={view.retry} />
      <RuleTemplates model={templates} />
    </div>
  );
}
type Row = DictionaryModel['table']['rows'][number];
// Routing rules count their hits in flow records; DNS rules have no such count.
const hitsColumn = (t: Translator): TableColumn<Row> => ({
  id: 'hits',
  label: t('rule.hits'),
  minWidth: 96,
  grow: 0,
  drop: 1,
  render: row => row.hits
});
// One rule list with its add and remove dialogs; the routing list and each DNS list render through it.
export function RuleDictionary({view, viewSwitch}: {view: DictionaryModel; viewSwitch?: ReactNode}) {
  const t = useT();
  // The row actions are new functions each render; a ref keeps the columns, and so the rows, stable.
  const latest = useRef(view);
  useLayoutEffect(() => {
    latest.current = view;
  });
  const {canWrite, busy} = view;
  const highlighted = useLandingHighlight(view.landed);
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
      {id: 'n', label: t('rule.id'), minWidth: 72, grow: 0, drop: 3, render: row => row.number},
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
        actions: true,
        label: t('ui.actions'),
        minWidth: 136,
        grow: 0,
        render: row => (
          <span className="rp-chain">
            <span className="rp-action-slot">
              {row.sourceQuery && (
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
  return (
    <div className="rp-col">
      <ActionHelp reason={view.canWrite ? view.addReason : null}>
        <Toolbar page>
          {view.table.caption && <span className="rp-label">{view.table.caption}</span>}
          <span className="rp-grow" />
          {view.canWrite && (
            <Button isDisabled={view.addDisabled} onPress={view.openAdd}>
              {t('rule.add')}
            </Button>
          )}
          {viewSwitch}
        </Toolbar>
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
        highlighted={highlighted ? view.landed : null}
        onSelect={view.select}
        height={560}
        fit
        empty={view.copy.empty}
        cols={columns}
      />
      <RuleDialogs view={view} />
    </div>
  );
}
function Distribution({view, viewSwitch}: {view: Model; viewSwitch?: ReactNode}) {
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
      {id: 'hits', label: t('rule.hits'), minWidth: 96, grow: 0, render: row => row.hits},
      {id: 'share', label: t('rule.share'), minWidth: 72, grow: 0, drop: 3, render: row => row.share}
    ],
    [t]
  );
  return (
    <div className="rp-col">
      <Toolbar page>
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
        <span className="rp-grow" />
        {viewSwitch}
      </Toolbar>
      <ErrorMessage error={view.error} onRetry={view.retry} />
      <DataTable label={t('rule.listTitle')} loading={view.loading} rows={table.rows} fit empty={table.empty} cols={columns} />
    </div>
  );
}
