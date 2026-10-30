import {useProgressiveRows} from './ui/useProgressiveRows';
import {CollectionLoading, RowPlaceholder} from './ui/CollectionLoading';
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Table anatomy adapted from the Astryx table template; see ASTRYX-TEMPLATES-LICENSE.
import {Button} from '@astryxdesign/core/Button';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {HStack, StackItem, VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {List, ListItem} from '@astryxdesign/core/List';
import {RowMenu as MoreMenu} from './ui/RowMenu';
import {Selector} from '@astryxdesign/core/Selector';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {LoadingText, loadingControl} from './ui/LoadingText';
import {Heading, Text} from '@astryxdesign/core/Text';
import {useToast} from '@astryxdesign/core/Toast';
import {Token} from '@astryxdesign/core/Token';
import {Tokenizer} from '@astryxdesign/core/Tokenizer';
import {startTransition, useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {conditionValues, parseConditionValues} from '../../../src/dae/groupConditions';
import {describeCondition, describeRule, describeTarget, phraseText} from './describe';
import {useMessages, type MessageKey} from './i18n';
import {
  addDraftRule,
  editDraftRule,
  kindsFor,
  moveRule,
  parseRuleList,
  serializeBuilder,
  setFallback,
  type Condition,
  type DraftRule,
  type RuleListKind
} from './ruleDraft';
import './ruleList.css';
import {CollectionSearch, CollectionToolbar} from './ui/CollectionToolbar';
import {useDragItems} from './ui/DragItems';
import {EditDialog} from './ui/EditDialog';
import {pageRhythm} from './ui/PageFrame';
import {usePageCommand, useSearchTarget} from './ui/commands';
import {RowEntrance} from './ui/motion/RowEntrance';
import {revealRow} from './ui/motion/revealRow';

const tokenSource = {search: () => [], bootstrap: () => []};
const conditionGroups: {title: MessageKey; kinds: string[]}[] = [
  {title: 'conditionWebsites', kinds: ['domainSuffix', 'domain', 'domainKeyword', 'geosite', 'qnameSuffix', 'qnameFull', 'qnameKeyword', 'qnameGeosite']},
  {title: 'conditionIps', kinds: ['dip', 'geoip', 'sip', 'answerIp', 'answerGeoip']},
  {title: 'conditionPorts', kinds: ['dport', 'l4proto', 'qtype', 'upstream']},
  {title: 'conditionPrograms', kinds: ['pname']},
  {title: 'advanced', kinds: ['sport', 'domainRegex', 'ipversion', 'mac', 'dscp', 'qnameRegex']}
];

export function RuleList({
  text,
  kind,
  targets,
  disabled,
  change,
  editText,
  controls,
  loading = false,
  primary = true,
  hideAdd = false,
  heading,
  textMode = false,
  showVisual,
  renderContent,
  revealRequest
}: {
  revealRequest?: {index: number} | null;
  text: string;
  kind: RuleListKind;
  targets: string[];
  disabled: boolean;
  change: (text: string) => void;
  editText: () => void;
  controls?: ReactNode;
  primary?: boolean;
  hideAdd?: boolean;
  loading?: boolean;
  heading?: ReactNode;
  textMode?: boolean;
  showVisual?: () => void;
  renderContent?: (content: ReactNode) => ReactNode;
}) {
  const t = useMessages();
  const toast = useToast();
  const root = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [editing, setEditing] = useState<DraftRule | 'new' | null>(null);
  const [deleting, setDeleting] = useState<DraftRule | null>(null);
  const [search, setSearch] = useState('');
  const [fallbackAdvanced, setFallbackAdvanced] = useState(false);
  const closeForm = () => {
    setEditing(null);
    requestAnimationFrame(() => returnFocus.current?.focus({preventScroll: true}));
  };
  const reveal = (index: number, added = false) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => revealRow(root.current?.querySelector<HTMLElement>(`[data-rule-index="${index}"]`) ?? null, added))
    );
  const lastReveal = useRef<typeof revealRequest>(undefined);
  useEffect(() => {
    if (!revealRequest || lastReveal.current === revealRequest) return;
    lastReveal.current = revealRequest;
    setSearch('');
    const observer = new MutationObserver(find);
    function find() {
      const row = root.current?.querySelector<HTMLElement>(`[data-rule-index="${revealRequest!.index}"]`);
      if (!row?.checkVisibility()) return;
      observer.disconnect();
      revealRow(row);
    }
    if (root.current) observer.observe(root.current, {childList: true, subtree: true, attributes: true});
    const frame = requestAnimationFrame(find);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [revealRequest]);
  usePageCommand('add-rule', kind === 'routing' && !disabled, () => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    startTransition(() => setEditing('new'));
  });
  const doc = useMemo(() => parseRuleList(text, kind), [text, kind]);
  const rows = doc.rows.filter(r => !r.fallback);
  const title = (row: DraftRule) => row.note || (row.conditions?.[0] ? phraseText(describeCondition(row.conditions[0]), t) : t.customRule);
  const description = (row: DraftRule) => phraseText(describeRule(row.conditions, row.target), t);
  useSearchTarget(
    'rule',
    !loading,
    target => {
      const row = doc.rows.find(row => row.anchor.text === target.id);
      if (!row) return;
      setSearch('');
      if (!disabled && row.conditions && !row.fallback) {
        returnFocus.current = root.current?.querySelector<HTMLElement>(`[data-rule-index="${rows.indexOf(row)}"]`) ?? null;
        setEditing(row);
      } else if (!row.conditions && !row.fallback) editText();
      else if (!row.fallback) reveal(rows.indexOf(row));
      else requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[data-fallback] button')?.focus());
    },
    kind
  );
  const fallback = doc.rows.find(r => r.fallback);
  const move = (from: number, to: number) => {
    if (disabled || from === to || to < 0 || to >= rows.length) return;
    change(moveRule(text, kind, from, to));
    setSearch('');
    drag.finish(
      t.movedItem.replace('{name}', title(rows[from])).replace('{n}', String(to + 1)),
      () => root.current?.querySelector(`[data-drag-handle="${to}"]`) ?? null
    );
    reveal(to);
  };
  const drag = useDragItems((from, to) => move(Number(from), Number(to)));
  const fallbackForced = !!fallback?.target.endsWith('(must)');
  const options = [...new Set([...targets, ...(fallback?.target ? [fallback.target] : [])].map(value => value.replace(/\(must\)$/, '')))].map(value => ({
    value,
    label: phraseText(describeTarget(value), t)
  }));
  const visible = rows
    .map((row, index) => ({row, index}))
    .filter(({row}) => `${title(row)} ${description(row)}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const progressive = useProgressiveRows(visible);
  const openRow = (row: DraftRule, element: Element) => {
    if (!row.conditions) return editText();
    returnFocus.current = element instanceof HTMLElement ? element : null;
    setEditing(row);
  };
  const content = (
    <>
      {doc.ambiguous ? (
        <Button label={t.listUnavailable} variant="ghost" onClick={editText} />
      ) : (
        <RowEntrance>
          <VStack gap={pageRhythm.section} data-collection>
            <CollectionLoading loading={loading} name={kind === 'routing' ? 'routing' : 'dns'}>
              <List hasDividers aria-label={kind === 'routing' ? t.rulesEditor : kind === 'request' ? t.dnsRequest : t.dnsResponse}>
                {loading &&
                  !rows.length &&
                  Array.from({length: 3}, (_, i) => (
                    <ListItem
                      key={`loading-${i}`}
                      data-skeleton-row
                      className="lite-rule-row"
                      startContent={drag.handle(`loading-${i}`, t.loading, true)}
                      label={<RowPlaceholder />}
                      description={
                        <HStack gap={1} wrap="wrap" vAlign="center">
                          <Token {...loadingControl(true, 'endContent', undefined, 'rule-chip')} label={t.loading} />
                        </HStack>
                      }
                      endContent={
                        <HStack gap={2} vAlign="start" style={{width: 'auto'}}>
                          <Token {...loadingControl(true, 'endContent', undefined, 'rule-chip lite-rule-target')} label={t.direct} />
                          <Skeleton className="lite-loading-shape lite-loading-icon" />
                        </HStack>
                      }
                    />
                  ))}
                {progressive.map(({row, index}) => (
                  <ListItem
                    key={index}
                    {...drag.target(String(index), disabled || !!search)}
                    data-rule-index={index}
                    data-skeleton-row={loading ? '' : undefined}
                    tabIndex={-1}
                    className="lite-rule-row"
                    startContent={drag.handle(String(index), t.dragItem.replace('{name}', title(row)), disabled || !!search)}
                    label={
                      <VStack gap={1}>
                        {row.note && row.note !== row.conditions?.map(condition => phraseText(describeCondition(condition), t)).join(t.condAnd) && (
                          <Link
                            {...loadingControl(loading, 'children', row.note)}
                            color="primary"
                            weight="medium"
                            isDisabled={disabled}
                            onClick={event => openRow(row, event.currentTarget)}
                            style={{textAlign: 'start', overflowWrap: 'anywhere'}}
                          />
                        )}
                        <HStack gap={1} wrap="wrap" vAlign="center" data-rule-conditions>
                          {row.conditions?.map((condition, i) => (
                            <Token
                              {...loadingControl(loading, 'endContent', undefined, 'rule-chip')}
                              key={i}
                              label={phraseText(describeCondition(condition), t)}
                              onClick={disabled ? undefined : event => openRow(row, event.currentTarget)}
                            />
                          ))}
                          {!row.conditions && <Link {...loadingControl(loading, 'children', t.customRule)} isDisabled={disabled} onClick={editText} />}
                          <LoadingText color="secondary" aria-hidden loading={loading} children="→" />
                          <Token
                            {...loadingControl(loading, 'endContent', undefined, 'rule-chip lite-rule-target')}
                            label={phraseText(describeTarget(row.target), t)}
                          />
                        </HStack>
                      </VStack>
                    }
                    endContent={
                      <HStack gap={2} vAlign="start" style={{width: 'auto'}}>
                        <MoreMenu
                          {...loadingControl(loading, 'icon')}
                          label={t.actionFor.replace('{name}', description(row))}
                          variant="ghost"
                          size="sm"
                          isDisabled={disabled}
                          items={[
                            {
                              label: row.conditions ? t.edit : t.editAsText,
                              onClick: () =>
                                openRow(row, root.current?.querySelector<HTMLElement>(`[data-rule-index="${index}"] button[aria-haspopup]`) ?? root.current!)
                            },
                            {label: t.moveFirst, isDisabled: index === 0, onClick: () => move(index, 0)},
                            {label: t.moveLast, isDisabled: index === rows.length - 1, onClick: () => move(index, rows.length - 1)},
                            {label: t.moveUp, isDisabled: index === 0, onClick: () => move(index, index - 1)},
                            {label: t.moveDown, isDisabled: index === rows.length - 1, onClick: () => move(index, index + 1)},
                            {label: t.delete, onClick: () => setDeleting(row)}
                          ]}
                        />
                      </HStack>
                    }
                  />
                ))}
              </List>
            </CollectionLoading>
            {!loading && !visible.length && (
              <EmptyState
                isCompact
                title={rows.length ? t.noMatches : t.noRules}
                description={rows.length ? t.noMatchesHelp : disabled ? t.readOnly : t.noRulesHelp}
              />
            )}
          </VStack>
        </RowEntrance>
      )}
      {!doc.ambiguous && (
        <Selector
          data-fallback
          style={{maxWidth: '22.5rem'}}
          label={kind === 'routing' ? t.fallback : kind === 'request' ? t.dnsFallback : t.dnsResponseFallback}
          value={fallback?.target.replace(/\(must\)$/, '') ?? ''}
          options={fallback ? options : [{value: '', label: t.defaultValue}, ...options]}
          isDisabled={disabled}
          width="100%"
          onChange={value => {
            if (value) change(setFallback(text, kind, value + (fallbackForced ? '(must)' : '')));
          }}
        />
      )}
      {kind === 'routing' && (fallback || loading) && (
        <Collapsible isOpen={fallbackAdvanced} onOpenChange={setFallbackAdvanced} chevronPosition="start" trigger={<Text type="label">{t.advanced}</Text>}>
          <VStack paddingBlockStart={2}>
            <CheckboxInput
              label={t.forceTarget}
              description={t.forceTargetHelp}
              value={fallbackForced}
              isDisabled={disabled}
              onChange={force => change(setFallback(text, kind, fallback!.target.replace(/\(must\)$/, '') + (force ? '(must)' : '')))}
            />
          </VStack>
        </Collapsible>
      )}
    </>
  );
  return (
    <VStack
      gap={pageRhythm.toolbarToCollection}
      width="100%"
      ref={root}
      data-rule-list={kind}
      onDragOver={event => {
        if (textMode || !event.defaultPrevented) return;
        for (let parent = root.current?.parentElement; parent; parent = parent.parentElement) {
          if (parent.scrollHeight <= parent.clientHeight || !/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) continue;
          const rect = parent.getBoundingClientRect();
          const edge = Math.min(rect.height / 5, 80);
          if (event.clientY < rect.top + edge) parent.scrollBy(0, -edge);
          else if (event.clientY > rect.bottom - edge) parent.scrollBy(0, edge);
          break;
        }
      }}
    >
      {heading}
      {!textMode && (
        <CollectionToolbar start={<CollectionSearch label={t.searchRules} placeholder={t.searchRules} value={search} onChange={setSearch} />}>
          {controls}
          {!hideAdd && (
            <Button
              label={t.addRule}
              variant={primary ? 'primary' : 'secondary'}
              size="md"
              isDisabled={disabled || doc.ambiguous}
              onClick={event => {
                returnFocus.current = event.currentTarget;
                startTransition(() => {
                  showVisual?.();
                  setEditing('new');
                });
              }}
            />
          )}
        </CollectionToolbar>
      )}
      {renderContent ? renderContent(content) : content}
      {drag.live}
      {editing && (
        <RuleForm
          kind={kind}
          row={editing === 'new' ? undefined : editing}
          targets={targets}
          close={closeForm}
          save={(conditions, target, position) => {
            const next =
              editing === 'new' ? addDraftRule(text, kind, serializeBuilder(conditions)!, target, position) : editDraftRule(text, editing, conditions, target);
            const index = editing === 'new' ? (position === 'first' ? 0 : rows.length) : rows.indexOf(editing);
            change(next);
            setSearch('');
            closeForm();
            reveal(index, editing === 'new');
            toast({body: (editing === 'new' ? t.ruleAdded : t.ruleUpdated).replace('{name}', phraseText(describeRule(conditions, target), t)), type: 'info'});
          }}
        />
      )}
      <EditDialog
        title={t.deleteRule}
        open={deleting !== null}
        close={() => setDeleting(null)}
        pending={false}
        label={t.delete}
        destructive
        confirm={() => {
          if (deleting) change(text.slice(0, deleting.from) + text.slice(deleting.to));
          setDeleting(null);
        }}
      >
        <Text>{deleting && description(deleting)}</Text>
        <Text>{t.leaveDraftHelp}</Text>
      </EditDialog>
    </VStack>
  );
}

function RuleForm({
  kind,
  row,
  targets,
  close,
  save
}: {
  kind: RuleListKind;
  row?: DraftRule;
  targets: string[];
  close: () => void;
  save: (conditions: Condition[], target: string, position: 'first' | 'last') => void;
}) {
  const t = useMessages();
  const initialKind = kind === 'routing' ? 'domainSuffix' : 'qnameSuffix';
  const [conditions, setConditions] = useState<Condition[]>(row?.conditions ?? [{kind: initialKind, value: '', negate: false}]);
  const [conditionIds, setConditionIds] = useState(() => conditions.map((_, i) => i));
  const nextConditionId = useRef(conditions.length);
  const [target, setTarget] = useState(row?.target?.replace(/\(must\)$/, '') ?? '');
  const [must, setMust] = useState(!!row?.target?.endsWith('(must)'));
  const [advanced, setAdvanced] = useState(false);
  const [position, setPosition] = useState<'first' | 'last'>('first');
  const [showText, setShowText] = useState(false);
  const expression = serializeBuilder(conditions);
  const outbound = target + (must ? '(must)' : '');
  const options = [...new Set([...targets.map(value => value.replace(/\(must\)$/, '')), ...(target ? [target] : [])])].map(value => ({
    value,
    label: phraseText(describeTarget(value), t)
  }));
  const update = (index: number, patch: Partial<Condition>) => setConditions(old => old.map((c, i) => (i === index ? {...c, ...patch} : c)));
  const types = conditionGroups
    .map(group => ({
      type: 'section' as const,
      title: t[group.title],
      options: group.kinds.filter(value => kindsFor(kind).includes(value)).map(value => ({value, label: t[`kind_${value}` as MessageKey]}))
    }))
    .filter(group => group.options.length);
  return (
    <EditDialog
      title={row ? t.editRule : t.addRule}
      open
      close={close}
      pending={false}
      label={row ? t.save : t.add}
      disabled={!expression || !target}
      disabledReason={!expression ? t.incompleteRule : kind === 'routing' ? t.chooseTarget : t.chooseDnsTarget}
      reset={
        row
          ? () => {
              const original = row?.conditions ?? [{kind: initialKind, value: '', negate: false}];
              setConditions(original);
              setConditionIds(original.map((_, i) => i));
              nextConditionId.current = original.length;
              setTarget(row?.target?.replace(/\(must\)$/, '') ?? '');
              setMust(!!row?.target?.endsWith('(must)'));
              setPosition('first');
            }
          : undefined
      }
      confirm={() => save(conditions, outbound, position)}
    >
      <Text type="supporting" color="secondary">
        {t.conditionHelp}
      </Text>
      <RowEntrance>
        <VStack as="ol" gap={3}>
          {conditions.map((condition, index) => (
            <VStack as="li" key={conditionIds[index]} gap={2}>
              <Selector
                label={`${t.conditionType} ${index + 1}`}
                value={condition.kind}
                options={types}
                onChange={value => update(index, {kind: value})}
                width="100%"
              />
              <ConditionValuesInput
                label={`${t.conditionValues} ${index + 1}`}
                value={condition.value}
                onChange={value => update(index, {value})}
                invalid={!!condition.value && !serializeBuilder([condition])}
              />
              <HStack gap={2} wrap="wrap" vAlign="center">
                <StackItem size="fill">
                  <CheckboxInput label={t.negate} value={condition.negate} onChange={negate => update(index, {negate})} />
                </StackItem>
                <Button
                  label={t.removeCondition}
                  variant="ghost"
                  size="sm"
                  isDisabled={conditions.length === 1}
                  onClick={() => {
                    setConditions(old => old.filter((_, i) => i !== index));
                    setConditionIds(old => old.filter((_, i) => i !== index));
                  }}
                />
              </HStack>
            </VStack>
          ))}
        </VStack>
      </RowEntrance>
      <HStack>
        <Button
          label={t.addCondition}
          variant="secondary"
          size="sm"
          onClick={() => {
            setConditionIds(old => [...old, nextConditionId.current++]);
            setConditions(old => [...old, {kind: initialKind, value: '', negate: false}]);
          }}
        />
      </HStack>
      <Selector
        label={kind === 'routing' ? t.outbound : t.dnsTarget}
        placeholder={kind === 'routing' ? t.chooseTarget : t.chooseDnsTarget}
        value={target}
        options={options}
        onChange={setTarget}
        hasSearch
        width="100%"
      />
      {!row && (
        <Selector
          label={t.rulePosition}
          value={position}
          options={[
            {value: 'first', label: t.ruleFirst},
            {value: 'last', label: t.ruleLast}
          ]}
          onChange={value => setPosition(value as 'first' | 'last')}
          width="100%"
        />
      )}
      {kind === 'routing' && (
        <Collapsible isOpen={advanced} onOpenChange={setAdvanced} chevronPosition="start" trigger={<Text type="label">{t.advanced}</Text>}>
          <VStack paddingBlockStart={2}>
            <CheckboxInput label={t.forceTarget} description={t.forceTargetHelp} value={must} onChange={setMust} />
          </VStack>
        </Collapsible>
      )}
      {expression && target && (
        <VStack gap={2}>
          <Heading level={3}>{t.generatedRule}</Heading>
          <Text>{phraseText(describeRule(conditions, outbound), t)}</Text>
        </VStack>
      )}
      {expression && target && (
        <Collapsible
          data-config-text
          isOpen={showText}
          onOpenChange={setShowText}
          chevronPosition="start"
          trigger={<Text type="label">{t.viewConfigText}</Text>}
        >
          {showText && <VStack as="pre" style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>{`${expression} -> ${outbound}`}</VStack>}
        </Collapsible>
      )}
    </EditDialog>
  );
}

function ConditionValuesInput({label, value, onChange, invalid}: {label: string; value: string; onChange: (value: string) => void; invalid: boolean}) {
  const t = useMessages();
  const query = useRef('');
  const [generation, setGeneration] = useState(0);
  const items = useMemo(() => (parseConditionValues(value) ?? []).map(label => ({id: label, label})), [value]);
  return (
    <Tokenizer
      key={generation}
      className="rule-values"
      label={label}
      value={items}
      onChange={(items, event) => {
        onChange(conditionValues(items.map(item => item.label)));
        if (event.type === 'create' || event.type === 'add') query.current = '';
      }}
      placeholder={t.enterValues}
      searchSource={tokenSource}
      onChangeQuery={value => {
        query.current = value;
      }}
      onBlur={() => {
        const typed = query.current.trim();
        if (!typed) return;
        onChange(conditionValues([...new Set([...items.map(item => item.label), typed])]));
        query.current = '';
        setGeneration(value => value + 1);
      }}
      hasCreate
      debounceMs={0}
      tokenOverflowBehavior="none"
      width="100%"
      renderItem={() => <Text>{t.addValue.replace('{value}', query.current.trim())}</Text>}
      renderToken={(item, onRemove) => <Token label={item.label} onRemove={onRemove} className="rule-value-token" />}
      status={invalid ? {type: 'error', message: t.invalidField} : undefined}
    />
  );
}
