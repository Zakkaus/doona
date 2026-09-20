import {useEffect, useMemo, useState} from 'react';
import {useCapabilities, useConfig, useConfigEditor, useFlows, useGroups, useRules} from '../../api/store';
import {formatNumber, LOCALE, useLang, useT} from '../../i18n';
import type {Key} from '../../i18n/messages';
import type {ConfigSource, RoutingRule} from '../../api/model';
import {
  Badge,
  Button,
  DataTable,
  LabeledSelect,
  Light,
  ModalDialog,
  Segmented,
  Switch,
  ErrorMessage,
  TextField,
  TextTooltip,
  errorText,
  toast
} from '../../ui/ui';
import Close from '../../ui/icons/Close';
import FileText from '../../ui/icons/FileText';
import {ruleDistribution} from './distribution';
import {candidate} from '../config/names';
import {Coverage} from '../flows/Coverage';
import type {PageProps} from '../types';

const sources: Record<string, Key> = {
  kernel: 'rule.sourceKernel',
  recomputed: 'rule.sourceRecomputed',
  unknown: 'rule.sourceUnknown'
};

// Rule IDs sort in config order when they carry a number; the rest keep their text order.
const ruleOrder = (a: string | null, b: string | null) => {
  if (a === null || b === null) return Number(a === null) - Number(b === null);
  return a.localeCompare(b, undefined, {numeric: true});
};

// The source a rule's `file` label names: the label is a redacted basename, so it is matched against the end
// of each accepted source's path.
const sourceFor = (list: ConfigSource[], file: string | undefined) =>
  file ? list.find(item => item.path === file || item.path.endsWith('/' + file)) : undefined;

// The rules as a list. With the backend's dictionary: every rule in evaluation order, where it is written and
// how many retained flows it decided; a rule can be added before another or at the end, or removed, by
// rewriting that line of the source through the same validate-then-save path the editor uses. Without the
// dictionary, the retained flows are grouped by the rule that decided them.
export function RuleList({go, query}: PageProps) {
  const resources = useCapabilities().data?.resources;
  return resources?.rules.available === true ? <Dictionary go={go} query={query} /> : <Distribution />;
}

function Dictionary({go, query}: PageProps) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const resources = useCapabilities().data?.resources;
  const rules = useRules();
  const flows = useFlows(undefined, resources?.flows.available === true);
  const groups = useGroups(resources?.groups.available === true);
  const canWrite = resources?.config.available === true && resources.config.writable === true;
  const config = useConfig(canWrite);
  const editor = useConfigEditor(() => {
    config.refetch();
    rules.refetch();
  });
  const canValidate = resources?.config_validate.available === true && (resources.config_validate.modes ?? []).includes('full');
  useEffect(() => {
    if (editor.error) toast('negative', errorText(editor.error));
  }, [editor.error]);
  const hits = useMemo(() => new Map(ruleDistribution(flows.data?.flows ?? []).map(row => [row.id, row.count])), [flows.data]);
  const [dialog, setDialog] = useState<{kind: 'add'} | {kind: 'remove'; rule: RoutingRule} | null>(null);
  const [form, setForm] = useState({condition: '', outbound: '', must: false, before: 'end'});
  const list = rules.data?.rules ?? [];
  // `?rule=` (from search) lands on that row: selected, and scrolled into view once the list is there.
  const landed = new URLSearchParams(query).get('rule');
  // The row picked by hand replaces the landed one; a new landing wins again.
  const [picked, setPicked] = useState<{landed: string | null; row: string | null}>({landed, row: landed});
  const selected = picked.landed === landed ? picked.row : landed;
  const setSelected = (row: string | null) => setPicked({landed, row});
  useEffect(() => {
    if (landed && rules.data) document.querySelector(`[role="row"][data-key="${CSS.escape(landed)}"]`)?.scrollIntoView({block: 'nearest'});
  }, [landed, rules.data]);
  const configSources = config.data?.sources ?? [];
  const writable = (rule: RoutingRule) => {
    const source = sourceFor(configSources, rule.source?.file);
    return !!source && source.writable && source.content !== undefined;
  };
  // Where a new rule can go: before the fallback when its line is known and writable, else before a writable rule.
  const fallback = list.find(rule => rule.kind === 'fallback');
  const positions = [
    ...(fallback && writable(fallback) ? [{id: 'end', label: t('rule.positionEnd')}] : []),
    ...list
      .filter(rule => rule.kind === 'rule' && writable(rule))
      .map(rule => ({id: rule.rule_id, label: t('rule.positionBefore', {n: String(rule.index + 1)}), desc: rule.expression}))
  ];
  const outbounds = [...(groups.data ?? []).map(g => g.name), 'direct', 'block'];
  const open = (next: NonNullable<typeof dialog>) => {
    setForm({condition: '', outbound: (groups.data?.[0]?.name ?? 'direct') as string, must: false, before: positions[0]?.id ?? 'end'});
    setDialog(next);
  };
  // Writes one changed source: validated in full when the backend can, then saved against its accepted digest.
  const write = async (source: ConfigSource, lines: string[]) => {
    const content = lines.join('\n');
    if (canValidate) {
      const check = await editor.validate({sources: [candidate(source, content)], mode: 'full'});
      if (!check) return false;
      if (!check.valid) {
        toast('negative', t('config.invalid', {n: String(check.diagnostics.filter(d => d.level === 'error').length)}));
        return false;
      }
    }
    return !!(await editor.save(source.id, content, source.content_sha256));
  };
  const add = async (close: () => void) => {
    // The new line goes before the chosen rule, else before the fallback, in whichever source holds that line.
    const anchor = form.before === 'end' ? list.find(rule => rule.kind === 'fallback') : list.find(rule => rule.rule_id === form.before);
    const source = sourceFor(configSources, anchor?.source?.file);
    if (!anchor?.source || !source || source.content === undefined) return;
    const lines = source.content.replace(/\n$/, '').split('\n');
    const at = anchor.source.line - 1;
    const indent = /^\s*/.exec(lines[at] ?? '')?.[0] ?? '';
    lines.splice(at, 0, `${indent}${form.condition.trim()} -> ${form.outbound}${form.must ? '(must)' : ''}`);
    if (await write(source, [...lines, ''])) {
      toast('positive', t('rule.added'));
      close();
    }
  };
  const remove = async (rule: RoutingRule, close: () => void) => {
    const source = sourceFor(configSources, rule.source?.file);
    if (!rule.source || !source || source.content === undefined) return;
    const lines = source.content.replace(/\n$/, '').split('\n');
    lines.splice(rule.source.line - 1, 1);
    if (await write(source, [...lines, ''])) {
      toast('positive', t('rule.removed'));
      close();
    }
  };
  const openSource = (rule: RoutingRule) => {
    const source = sourceFor(configSources, rule.source?.file);
    if (source && rule.source) go('config', `tab=source&source=${encodeURIComponent(source.id)}&line=${rule.source.line}`);
  };
  const conditionValid = /\w\(/.test(form.condition) && !form.condition.includes('->');
  return (
    <div className="rp-col">
      <div className="rp-toolbar">
        {rules.data && (
          <span className="rp-label">{t('rule.dictionaryCaption', {n: formatNumber(list.length, locale), generation: rules.data.generation_id})}</span>
        )}
        <span className="rp-grow" />
        {canWrite && (
          <Button small isDisabled={!positions.length || !!editor.busy} onPress={() => open({kind: 'add'})}>
            {t('rule.add')}
          </Button>
        )}
      </div>
      <ErrorMessage
        error={rules.error ?? config.error}
        onRetry={() => {
          rules.refetch();
          config.refetch();
        }}
      />
      <DataTable
        label={t('rule.listTitle')}
        loading={rules.loading && !rules.data}
        rows={list.map(rule => ({...rule, id: rule.rule_id}))}
        selected={selected}
        onSelect={setSelected}
        height={560}
        empty={t('rule.distributionEmpty')}
        cols={[
          {id: 'n', label: t('rule.id'), minWidth: 56, grow: 0},
          {id: 'expression', label: t('rule.expression'), minWidth: 260, grow: 3, isRowHeader: true},
          {id: 'outbound', label: t('ui.outbound'), minWidth: 120, grow: 0},
          {id: 'source', label: t('rule.where'), minWidth: 140, grow: 0, drop: 2},
          {id: 'hits', label: t('rule.hits'), minWidth: 72, grow: 0, align: 'end', drop: 1},
          {id: 'actions', label: t('ui.actions'), minWidth: canWrite ? 96 : 56, grow: 0}
        ]}
        render={rule => [
          rule.kind === 'fallback' ? '—' : String(rule.index + 1),
          <TextTooltip className="rp-code">{rule.expression}</TextTooltip>,
          <span className="rp-chain">
            {rule.outbound}
            {rule.must && <Badge>must</Badge>}
          </span>,
          rule.source ? `${rule.source.file}:${rule.source.line}` : '—',
          hits.has(rule.rule_id) ? formatNumber(hits.get(rule.rule_id)!, locale) : '—',
          <span className="rp-chain">
            {rule.source && sourceFor(configSources, rule.source.file) && (
              <Button small quiet icon label={t('rule.openSource')} onPress={() => openSource(rule)}>
                <FileText />
              </Button>
            )}
            {canWrite && rule.kind === 'rule' && writable(rule) && (
              <Button small quiet icon isDisabled={!!editor.busy} label={t('rule.remove')} onPress={() => open({kind: 'remove', rule})}>
                <Close />
              </Button>
            )}
          </span>
        ]}
      />
      <ModalDialog
        title={dialog?.kind === 'remove' ? t('rule.removeTitle') : t('rule.add')}
        narrow
        alert={dialog?.kind === 'remove'}
        isOpen={dialog !== null}
        onOpenChange={isOpen => {
          if (!isOpen) setDialog(null);
        }}
        footer={close => (
          <>
            <Button onPress={close}>{t('ui.cancel')}</Button>
            {dialog?.kind === 'remove' ? (
              <Button negative isPending={!!editor.busy} onPress={() => void remove(dialog.rule, close)}>
                {t('rule.remove')}
              </Button>
            ) : (
              <Button accent isDisabled={!conditionValid || !form.outbound} isPending={!!editor.busy} onPress={() => void add(close)}>
                {t('rule.add')}
              </Button>
            )}
          </>
        )}
      >
        {dialog?.kind === 'remove' && (
          <div className="rp-list">
            <span className="rp-label">{t('rule.removeHelp', {file: dialog.rule.source?.file ?? '', line: String(dialog.rule.source?.line ?? '')})}</span>
            <span className="rp-code">{dialog.rule.expression}</span>
          </div>
        )}
        {dialog?.kind === 'add' && (
          <div className="rp-list">
            <span className="rp-label">{t('rule.addHelp')}</span>
            <TextField
              label={t('rule.condition')}
              value={form.condition}
              placeholder="domain(geosite:netflix)"
              isInvalid={form.condition !== '' && !conditionValid}
              onChange={condition => setForm({...form, condition})}
            />
            <div className="rp-toolbar">
              <LabeledSelect
                label={t('ui.outbound')}
                value={form.outbound}
                onChange={outbound => setForm({...form, outbound})}
                items={outbounds.map(id => ({id, label: id}))}
              />
              <Switch isSelected={form.must} onChange={must => setForm({...form, must})}>
                must
              </Switch>
            </div>
            <LabeledSelect label={t('rule.position')} value={form.before} onChange={before => setForm({...form, before})} items={positions} />
          </div>
        )}
      </ModalDialog>
    </div>
  );
}

// Without a dictionary: the retained flows grouped by the rule that decided them.
function Distribution() {
  const resource = useFlows();
  const t = useT();
  const locale = LOCALE[useLang()];
  const [source, setSource] = useState('all');
  const rows = useMemo(
    () =>
      (resource.data ? ruleDistribution(resource.data.flows) : [])
        .map((row, i) => ({...row, key: String(i)}))
        .sort((a, b) => ruleOrder(a.id, b.id) || b.count - a.count),
    [resource.data]
  );
  const list = resource.data ?? null;
  const filtered = source === 'all' ? rows : rows.filter(row => row.source === source);
  return (
    <div className="rp-col">
      <div className="rp-toolbar">
        <Segmented
          label={t('rule.distributionSource')}
          value={source}
          onChange={setSource}
          items={[['all', t('ui.all')], ...Object.entries(sources).map(([id, label]): [string, string] => [id, t(label)])]}
        />
        {list && (
          <TextTooltip text={t('rule.distributionScope')} className="rp-label">
            {t('rule.distributionCaption', {n: formatNumber(list.flows.length, locale)})}
          </TextTooltip>
        )}
        {list && <Coverage data={list} />}
        {list && list.dropped_records === null && (
          <Light small tone="warn">
            {t('rule.droppedUnknown')}
          </Light>
        )}
      </div>
      {resource.error && <ErrorMessage error={resource.error} />}
      <DataTable
        label={t('rule.listTitle')}
        loading={resource.loading && !resource.data}
        rows={filtered.map(row => ({...row, ruleId: row.id, id: row.key}))}
        empty={t('rule.distributionEmpty')}
        cols={[
          {id: 'n', label: t('rule.id'), minWidth: 72, grow: 0, drop: 2},
          {id: 'expression', label: t('rule.expression'), minWidth: 240, grow: 3, isRowHeader: true},
          {id: 'source', label: t('rule.distributionSource'), minWidth: 96, grow: 0, drop: 1},
          {id: 'hits', label: t('rule.hits'), minWidth: 72, grow: 0, align: 'end'},
          {id: 'share', label: t('rule.share'), minWidth: 72, grow: 0, align: 'end', drop: 3}
        ]}
        render={row => [
          row.ruleId ?? '—',
          <TextTooltip className={row.expression ? 'rp-code' : undefined}>{row.expression ?? t('rule.unknownRule')}</TextTooltip>,
          <Badge>{t(sources[row.source])}</Badge>,
          formatNumber(row.count, locale),
          formatNumber(row.share * 100, locale, 1) + '%'
        ]}
      />
    </div>
  );
}
