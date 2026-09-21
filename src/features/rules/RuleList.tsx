import {useEffect, useMemo, useState} from 'react';
import {useCapabilities, useConfig, useConfigEditor, useFlows, useGroups, useRules} from '../../api/store';
import {formatNumber, LOCALE, useLang, useT} from '../../i18n';
import type {Key} from '../../i18n/messages';
import type {ConfigSource, RoutingRule, RuleSource} from '../../api/model';
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
import {fileName} from '../config/names';
import {conditionKinds, ruleCondition, type ConditionKind} from '../config/groups';
import {Coverage} from '../flows/Coverage';
import type {PageProps} from '../types';

const kindLabels: Record<ConditionKind, Key> = {
  domainSuffix: 'rule.kind.domainSuffix',
  domain: 'rule.kind.domain',
  geosite: 'rule.kind.geosite',
  dip: 'rule.kind.dip',
  geoip: 'rule.kind.geoip',
  sip: 'rule.kind.sip',
  dport: 'rule.kind.dport',
  sport: 'rule.kind.sport',
  pname: 'rule.kind.pname',
  l4proto: 'rule.kind.l4proto'
};
const kindHints: Record<ConditionKind, string> = {
  domainSuffix: 'example.com, example.org',
  domain: 'www.example.com',
  geosite: 'netflix, cn',
  dip: '10.0.0.0/8, 224.0.0.0/4',
  geoip: 'cn, private',
  sip: '192.168.1.10',
  dport: '80, 443',
  sport: '53',
  pname: 'curl, firefox',
  l4proto: 'udp'
};

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

// The accepted source a rule came from: by id when the backend names it, else by its `file` label, a redacted
// basename matched against the end of each source's path.
const sourceFor = (list: ConfigSource[], source: RuleSource | null | undefined) =>
  source
    ? (list.find(item => item.id === source.source_id) ?? list.find(item => item.path === source.file || item.path.endsWith('/' + source.file)))
    : undefined;

// Use the backend dictionary when available; otherwise group retained flows by deciding rule. Edits rewrite the owning source through validate-and-save.
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
  useEffect(() => {
    if (editor.error) toast('negative', errorText(editor.error));
  }, [editor.error]);
  const hits = useMemo(() => new Map(ruleDistribution(flows.data?.flows ?? []).map(row => [row.id, row.count])), [flows.data]);
  // The removal keeps the source as it was when the dialog opened, so a file changed meanwhile answers 412.
  const [dialog, setDialog] = useState<{kind: 'add'} | {kind: 'remove'; rule: RoutingRule; source: ConfigSource} | null>(null);
  const [form, setForm] = useState({condition: '', outbound: '', must: false, before: 'end'});
  const [pick, setPick] = useState<{on: boolean; kind: ConditionKind; value: string}>({on: true, kind: 'domainSuffix', value: ''});
  const condition = pick.on ? ruleCondition(pick.kind, pick.value) : form.condition.trim();
  const list = rules.data?.rules ?? [];
  // `?rule=` (from search) lands on that row: selected, and scrolled into view once the list is there.
  const landed = new URLSearchParams(query).get('rule');
  // The row picked by hand replaces the landed one; a new landing wins again.
  const [picked, setPicked] = useState<{landed: string | null; row: string | null}>({landed, row: landed});
  const selected = picked.landed === landed ? picked.row : landed;
  const setSelected = (row: string | null) => setPicked({landed, row});
  const configSources = config.data?.sources ?? [];
  const sourceToEdit = (rule: RoutingRule | undefined) => configSources.find(source => source.id === rule?.source?.source_id);
  const writable = (rule: RoutingRule) => {
    const source = sourceToEdit(rule);
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
    // Line numbers come from the rule list and the text from the config; they must describe the same generation.
    if (rules.data?.generation_id !== config.data?.generation_id) {
      toast('negative', t('rule.stale'));
      rules.refetch();
      config.refetch();
      return;
    }
    setForm({condition: '', outbound: (groups.data?.[0]?.name ?? 'direct') as string, must: false, before: positions[0]?.id ?? 'end'});
    setPick({on: true, kind: 'domainSuffix', value: ''});
    setDialog(next);
  };
  const write = async (source: ConfigSource, transform: (text: string) => string | null) => {
    const result = await editor.apply(source, transform);
    if (!result) return false;
    if (result.diagnostics) {
      toast('negative', t('config.invalid', {n: String(result.diagnostics.filter(d => d.level === 'error').length)}));
      return false;
    }
    return true;
  };
  const add = async (close: () => void) => {
    if (!rules.data || !config.data || rules.data.generation_id !== config.data.generation_id) {
      toast('negative', t('rule.stale'));
      rules.refetch();
      config.refetch();
      return;
    }
    const anchor = form.before === 'end' ? list.find(rule => rule.kind === 'fallback') : list.find(rule => rule.rule_id === form.before);
    const source = sourceToEdit(anchor);
    if (!anchor?.source || !source) return;
    const at = anchor.source.line - 1;
    if (
      await write(source, text => {
        const lines = text.replace(/\n$/, '').split('\n');
        const indent = /^\s*/.exec(lines[at] ?? '')?.[0] ?? '';
        lines.splice(at, 0, `${indent}${condition} -> ${form.outbound}${form.must ? '(must)' : ''}`);
        return [...lines, ''].join('\n');
      })
    ) {
      toast('positive', t('rule.added'));
      close();
    }
  };
  const remove = async (rule: RoutingRule, source: ConfigSource, close: () => void) => {
    if (!rule.source) return;
    const at = rule.source.line - 1;
    if (
      await write(source, text => {
        const lines = text.replace(/\n$/, '').split('\n');
        if (!lines[at]?.includes('->')) {
          toast('negative', t('rule.stale'));
          rules.refetch();
          config.refetch();
          return null;
        }
        lines.splice(at, 1);
        return [...lines, ''].join('\n');
      })
    ) {
      toast('positive', t('rule.removed'));
      close();
    }
  };
  const openSource = (rule: RoutingRule) => {
    const source = sourceFor(configSources, rule.source);
    if (source && rule.source) go('config', `tab=source&source=${encodeURIComponent(source.id)}&line=${rule.source.line}`);
  };
  // Where a rule is written: the file's name when a source is matched (a redacted path is named by kind), else
  // the backend's label, which may itself be redacted and then leaves only the line.
  const label = (source: RuleSource) => {
    const matched = sourceFor(configSources, source);
    return matched ? fileName(matched) : source.file === '<redacted>' ? '' : source.file;
  };
  const position = (source: RuleSource) => {
    const file = label(source);
    return file ? `${file}:${source.line}` : t('rule.lineOnly', {n: String(source.line)});
  };
  const conditionValid = pick.on ? pick.value.trim() !== '' : /\w\(/.test(form.condition) && !form.condition.includes('->');
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
        reveal
        onSelect={setSelected}
        height={560}
        empty={t('rule.distributionEmpty')}
        cols={[
          {id: 'n', label: t('rule.id'), minWidth: 44, grow: 0, drop: 3},
          {id: 'expression', label: t('rule.expression'), minWidth: 160, grow: 3, isRowHeader: true},
          {id: 'outbound', label: t('ui.outbound'), minWidth: 100, grow: 0},
          {id: 'source', label: t('rule.where'), minWidth: 116, grow: 0, drop: 2},
          {id: 'hits', label: t('rule.hits'), minWidth: 60, grow: 0, align: 'end', drop: 1},
          {id: 'actions', label: t('ui.actions'), minWidth: canWrite ? 96 : 56, grow: 0}
        ]}
        render={rule => [
          rule.kind === 'fallback' ? '—' : String(rule.index + 1),
          <TextTooltip className="rp-code">{rule.expression}</TextTooltip>,
          <span className="rp-chain">
            {rule.outbound}
            {rule.must && <Badge>must</Badge>}
          </span>,
          rule.source ? position(rule.source) : '—',
          hits.has(rule.rule_id) ? formatNumber(hits.get(rule.rule_id)!, locale) : '—',
          <span className="rp-chain">
            {rule.source && sourceFor(configSources, rule.source) && (
              <Button small quiet icon label={t('rule.openSource')} onPress={() => openSource(rule)}>
                <FileText />
              </Button>
            )}
            {canWrite && rule.kind === 'rule' && writable(rule) && (
              <Button
                small
                quiet
                icon
                isDisabled={!!editor.busy}
                label={t('rule.remove')}
                onPress={() => open({kind: 'remove', rule, source: sourceToEdit(rule)!})}
              >
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
              <Button negative isPending={!!editor.busy} onPress={() => void remove(dialog.rule, dialog.source, close)}>
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
            <span className="rp-label">
              {t('rule.removeHelp', {file: dialog.rule.source ? label(dialog.rule.source) : '', line: String(dialog.rule.source?.line ?? '')})}
            </span>
            <span className="rp-code">{dialog.rule.expression}</span>
          </div>
        )}
        {dialog?.kind === 'add' && (
          <div className="rp-list">
            <span className="rp-label">{t('rule.addHelp')}</span>
            <Segmented
              label={t('rule.conditionMode')}
              value={pick.on ? 'pick' : 'text'}
              onChange={mode => {
                // Leaving the picker keeps what it composed, so the expression can be refined by hand.
                if (mode === 'text' && pick.on && pick.value.trim()) setForm({...form, condition});
                setPick({...pick, on: mode === 'pick'});
              }}
              items={[
                ['pick', t('rule.pick')],
                ['text', t('rule.expression')]
              ]}
            />
            {pick.on ? (
              <>
                <div className="rp-toolbar top">
                  <LabeledSelect
                    label={t('rule.kind')}
                    value={pick.kind}
                    onChange={kind => setPick({...pick, kind: kind as ConditionKind})}
                    items={conditionKinds.map(kind => ({id: kind, label: t(kindLabels[kind])}))}
                  />
                  <TextField
                    label={t('rule.values')}
                    value={pick.value}
                    placeholder={kindHints[pick.kind]}
                    description={t('rule.valuesHelp')}
                    spellCheck={false}
                    onChange={value => setPick({...pick, value})}
                  />
                </div>
                {pick.value.trim() !== '' && <span className="rp-code">{condition}</span>}
              </>
            ) : (
              <TextField
                label={t('rule.condition')}
                value={form.condition}
                placeholder="domain(geosite:netflix)"
                isInvalid={form.condition !== '' && !conditionValid}
                spellCheck={false}
                onChange={condition => setForm({...form, condition})}
              />
            )}
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
