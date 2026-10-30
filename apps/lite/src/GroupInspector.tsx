// Copyright (c) Meta Platforms, Inc. and affiliates.
// Inspector anatomy adapted from the Astryx incident-console and table-filter templates; see ASTRYX-TEMPLATES-LICENSE.

import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Divider} from '@astryxdesign/core/Divider';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {HStack, StackItem, VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {Section} from '@astryxdesign/core/Section';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {Selector} from '@astryxdesign/core/Selector';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {LoadingText} from './ui/LoadingText';
import {Spinner} from '@astryxdesign/core/Spinner';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Heading, Text} from '@astryxdesign/core/Text';
import {ToggleButton} from '@astryxdesign/core/ToggleButton';
import {RowTooltip as Tooltip} from './ui/RowTooltip';
import * as stylex from '@stylexjs/stylex';
import {memo, useCallback, useContext, useDeferredValue, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {Group, GroupSelectionRequest, Node, Provider} from '../../../src/api/model';
import {compareLatency, healthMillis} from '../../../src/api/selectors';
import {regions} from '../../../src/dae/regions';
import {policyKey} from './describe';
import {memberName, observedMembers, type HealthFallback} from './groupHealth';
import {LocaleContext, useMessages} from './i18n';
import {regionOf} from './regions';
import {RowPlaceholder} from './ui/CollectionLoading';
import {CollectionSearch, CollectionToolbar} from './ui/CollectionToolbar';
import {pageRhythm} from './ui/PageFrame';
import {policyLabel} from './ui/groupLabels';
import {Pin, Refresh, Search} from './ui/icons';
import {RowEntrance} from './ui/motion';
import {nodeOrigin} from './ui/nodeOrigin';
import {PAGE_SIZE} from './ui/usePaged';
import {useProgressiveRows} from './ui/useProgressiveRows';

type Network = GroupSelectionRequest['network'];
type Row = {id: string; name: string; nested: boolean; source: string; protocol: string; latency: number | null; state: string} & Record<string, unknown>;

export const inspectorStyles = stylex.create({
  // Selector-chip family from table-filter: one border and radius for the unset selectors and the toggles beside them.
  chip: {
    borderWidth: 'var(--border-width)',
    borderStyle: 'solid',
    borderColor: 'var(--color-border-emphasized)',
    borderRadius: 'var(--radius-element)',
    fontWeight: 'var(--font-weight-normal)'
  },
  chipIdle: {backgroundColor: 'var(--color-background-surface)', color: 'var(--color-text-secondary)'},
  filled: {backgroundColor: 'var(--color-overlay-pressed)'},
  row: {cursor: 'pointer'},
  member: {
    minHeight: 'calc(var(--spacing-12) + var(--spacing-1))',
    contain: 'inline-size layout style',
    contentVisibility: 'auto',
    containIntrinsicBlockSize: 'auto calc(var(--spacing-8) + var(--spacing-3))',
    paddingBlock: 'var(--spacing-1)',
    paddingInline: 'var(--spacing-3)',
    borderRadius: 'var(--radius-element)',
    ':hover': {backgroundColor: 'var(--color-overlay-hover)'}
  },
  latency: {minWidth: 'var(--spacing-12)', textAlign: 'end'},
  // The template's active row: one step past hover in the neutral ramp, replayed on pinned cells.
  // Astryx 0.6.8 has no selected-row overlay API that also paints pinned cells.
  active: {backgroundColor: 'var(--color-overlay-pressed)', '--table-row-overlay': 'var(--color-overlay-pressed)'},
  wrap: {overflowWrap: 'anywhere', minWidth: 0},
  search: {flexGrow: 1, flexBasis: 'calc(var(--spacing-10) * 5)', minWidth: 0}
});

const MemberRow = memo(
  function MemberRow({
    item,
    selected,
    mark,
    pending,
    manual,
    canSelect,
    disabled,
    choose,
    jump
  }: {
    item: Row;
    selected: boolean;
    mark: string | null;
    pending: boolean;
    manual: boolean;
    canSelect: boolean;
    disabled: boolean;
    choose: (id: string) => void;
    jump: (id: string) => void;
  }) {
    const t = useMessages();
    const latencyCell = (item: Row) =>
      item.state === 'unavailable' ? (
        <HStack gap={1} vAlign="center" hAlign="end">
          <StatusDot variant="error" label={t.memberUnreachable} />
          <Text type="supporting" color="secondary">
            {t.memberUnreachable}
          </Text>
        </HStack>
      ) : (
        <Text hasTabularNumbers color={item.latency == null ? 'secondary' : undefined}>
          {item.latency == null ? '—' : `${Math.round(item.latency)} ms`}
        </Text>
      );
    return (
      <RadioListItem
        key={item.id}
        value={item.id}
        data-member-row={item.id}
        aria-current={selected || mark !== null ? true : undefined}
        aria-label={`${t.switchNode}: ${item.name}`}
        tabIndex={-1}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          const rows = Array.from(event.currentTarget.closest('[role="radiogroup"]')?.querySelectorAll<HTMLElement>('[data-member-row]') ?? []);
          const index = rows.indexOf(event.currentTarget);
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? rows.length - 1
                : event.key === 'ArrowDown'
                  ? index + 1
                  : event.key === 'ArrowUp'
                    ? index - 1
                    : null;
          if (next !== null) {
            event.preventDefault();
            rows[Math.max(0, Math.min(rows.length - 1, next))]?.focus();
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            choose(item.id);
          }
        }}
        xstyle={[inspectorStyles.member, (selected || mark !== null) && inspectorStyles.active]}
        label={
          <VStack gap={0}>
            {item.nested ? (
              <Link label={t.labelValue.replace('{label}', t.openGroup).replace('{value}', item.name)} onClick={() => jump(item.id)}>
                {item.name}
              </Link>
            ) : (
              <>
                <Text weight="medium" textWrap="wrap">
                  {item.name}
                </Text>
                <Text type="supporting" color="secondary" textWrap="wrap">
                  {[item.source, item.protocol, mark].filter(Boolean).join(' / ')}
                </Text>
              </>
            )}
          </VStack>
        }
        endContent={
          <HStack gap={2} vAlign="center" style={{width: 'auto'}}>
            {pending ? (
              <Spinner size="sm" label={t.pending} />
            ) : !manual && canSelect && !selected ? (
              <Tooltip content={t.pinMember}>
                <IconButton
                  label={`${t.pinMember}: ${item.name}`}
                  variant="ghost"
                  size="sm"
                  icon={<Icon icon={Pin} size="sm" />}
                  isDisabled={disabled}
                  onClick={() => choose(item.id)}
                />
              </Tooltip>
            ) : null}
            <VStack xstyle={inspectorStyles.latency}>{latencyCell(item)}</VStack>
          </HStack>
        }
      />
    );
  },
  (before, after) =>
    Object.keys(before.item).every(key => before.item[key] === after.item[key]) &&
    before.selected === after.selected &&
    before.mark === after.mark &&
    before.pending === after.pending &&
    before.manual === after.manual &&
    before.canSelect === after.canSelect &&
    before.disabled === after.disabled &&
    before.choose === after.choose &&
    before.jump === after.jump
);

export function GroupInspector({
  group,
  nodes,
  providers,
  fallback,
  disabled,
  pending,
  select,
  probe,
  jump,
  edit,
  sheet
}: {
  group: Group;
  nodes: Node[];
  providers: Provider[];
  fallback: HealthFallback;
  disabled: boolean;
  pending: string | null;
  select: (id: string | null, network: Network) => void;
  probe?: () => void;
  jump: (id: string) => void;
  edit?: () => void;
  sheet: boolean;
}) {
  const t = useMessages();
  const deferredDisabled = useDeferredValue(disabled);
  const deferredPending = useDeferredValue(pending);
  const pair = (label: string, value: string) => t.labelValue.replace('{label}', label).replace('{value}', value);
  const locale = useContext(LocaleContext);
  const [search, setSearch] = useState('');
  const [network, setNetwork] = useState<Network>('both');
  const [region, setRegion] = useState<string | null>(null);
  const [sort, setSort] = useState('latency');
  const [alive, setAlive] = useState(false);
  const selection = group.runtime.selection;
  const split = selection.tcp?.member_id !== selection.udp?.member_id;
  const [showSplit, setShowSplit] = useState(split);
  const manual = group.capabilities.can_select;
  const pinnedName = memberName(group, (network === 'udp' ? selection.udp : selection.tcp)?.member_id, t.unknown);
  const canSelect = group.capabilities.can_select || group.capabilities.can_override;
  const pinned = (network === 'both' ? [selection.tcp, selection.udp] : [selection[network]]).some(item => item?.source === 'override');
  const current = split
    ? `TCP: ${memberName(group, selection.tcp?.member_id, t.unknown)} / UDP: ${memberName(group, selection.udp?.member_id, t.unknown)}`
    : memberName(group, selection.tcp?.member_id, t.unknown);
  const selectedId = network === 'both' ? (split ? undefined : selection.tcp?.member_id) : selection[network]?.member_id;
  const observed = useMemo(() => observedMembers(group, fallback), [group, fallback]);
  const nodeById = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes]);
  const filters = search !== '' || region !== null || alive;
  const rows: Row[] = useMemo(
    () =>
      observed
        .filter(
          member =>
            `${member.name} ${nodeById.get(member.id)?.protocol ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
            (region === null || regionOf(member.name) === region) &&
            (!alive || member.health?.state === 'healthy')
        )
        .sort(
          (a, b) =>
            Number([selection.tcp?.member_id, selection.udp?.member_id].includes(b.id)) -
              Number([selection.tcp?.member_id, selection.udp?.member_id].includes(a.id)) ||
            (sort === 'latency' ? compareLatency(healthMillis(a.health), healthMillis(b.health)) : 0) ||
            a.name.localeCompare(b.name, locale)
        )
        .map(member => {
          const node = nodeById.get(member.id);
          return {
            id: member.id,
            name: member.name || member.id,
            nested: member.kind === 'group',
            source: member.kind === 'group' ? t.group : nodeOrigin(node, providers, t.manualLabel),
            protocol: member.kind === 'group' ? '' : (node?.protocol ?? t.unknown),
            latency: healthMillis(member.health) ?? null,
            state: member.health?.state ?? 'unknown'
          };
        }),
    [observed, nodeById, providers, search, region, alive, sort, selection, locale, t]
  );
  const nested = rows.filter(row => row.nested);
  const leaves = rows.filter(row => !row.nested);
  const pageRows = useProgressiveRows(leaves, 12, 8);
  const mark = (id: string) =>
    network === 'both' && split ? (selection.tcp?.member_id === id ? 'TCP' : selection.udp?.member_id === id ? 'UDP' : null) : null;
  const scrollBeforeSelection = useRef<{element: HTMLElement; top: number} | null>(null);
  useLayoutEffect(() => {
    const scroll = scrollBeforeSelection.current;
    if (!scroll) return;
    scroll.element.scrollTop = scroll.top;
    const frame = requestAnimationFrame(() => {
      scroll.element.scrollTop = scroll.top;
      scrollBeforeSelection.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedId]);
  const choose = (id: string) => {
    if (disabled || !canSelect || pending !== null || id === selectedId) return;
    let element = document.querySelector<HTMLElement>(`[data-group-inspector="${CSS.escape(group.name)}"]`);
    while (element && !/auto|scroll/.test(getComputedStyle(element).overflowY)) element = element.parentElement;
    if (element) scrollBeforeSelection.current = {element, top: element.scrollTop};
    select(id, network);
  };
  const handlers = useRef({choose, jump});
  useLayoutEffect(() => {
    handlers.current = {choose, jump};
  });
  const chooseRow = useCallback((id: string) => handlers.current.choose(id), []);
  const jumpRow = useCallback((id: string) => handlers.current.jump(id), []);
  const members = (items: Row[]) =>
    items.map(item => (
      <MemberRow
        key={item.id}
        item={item}
        selected={item.id === selectedId}
        mark={mark(item.id)}
        pending={deferredPending === item.id}
        manual={manual}
        canSelect={canSelect}
        disabled={!manual && (deferredDisabled || deferredPending !== null)}
        choose={chooseRow}
        jump={jumpRow}
      />
    ));
  const regionOptions = useMemo(
    () =>
      regions
        .filter(([iso]) => observed.some(member => regionOf(member.name) === iso))
        .map(([iso, , names]) => ({value: iso, label: names?.short[locale] ?? new Intl.DisplayNames([locale], {type: 'region'}).of(iso) ?? iso})),
    [observed, locale]
  );
  return (
    <VStack gap={0} data-group-inspector={group.name} aria-busy={pending !== null}>
      <Section variant="transparent" padding={pageRhythm.inset} paddingBlockStart={sheet ? 0 : pageRhythm.inset}>
        <VStack gap={3}>
          <HStack gap={3} vAlign="center">
            <StackItem size="fill" style={{minWidth: 0}}>
              <VStack gap={1}>
                <Heading level={2} xstyle={inspectorStyles.wrap}>
                  {group.name}
                </Heading>
                <Text type="supporting" color="secondary" xstyle={inspectorStyles.wrap}>
                  {policyLabel(group.policy.native || group.policy.kind, t)}
                </Text>
                {!pinned && (
                  <Text type="supporting" color="secondary" xstyle={inspectorStyles.wrap}>
                    {pair(!manual ? t.automaticLabel : t.currentMember, current)}
                  </Text>
                )}
              </VStack>
            </StackItem>
            {canSelect && selection.tcp && selection.udp && <Button label={t.splitNetworks} variant="ghost" size="sm" onClick={() => setShowSplit(true)} />}
          </HStack>
          {pinned && (
            <Banner
              status="info"
              collapsible={false}
              data-pinned-banner
              title={(policyKey(group.policy.native || group.policy.kind) === 'policyUrlTest' ? t.pinnedBanner : t.pinnedBannerOther).replace(
                '{name}',
                split && network === 'both' ? current : pinnedName
              )}
              endContent={
                group.capabilities.can_override ? (
                  <Button
                    label={t.restoreAutomatic}
                    variant="secondary"
                    size="sm"
                    isLoading={pending === 'automatic'}
                    isDisabled={disabled || pending !== null}
                    onClick={() => select(null, network)}
                  />
                ) : undefined
              }
            />
          )}
          {canSelect && (showSplit || split) && selection.tcp && selection.udp && (
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Text type="supporting" color="secondary">
                {t.network}
              </Text>
              <SegmentedControl label={t.network} value={network} onChange={value => setNetwork(value as Network)} size="md">
                <SegmentedControlItem value="both" label={t.both} />
                <SegmentedControlItem value="tcp" label={t.tcpOnly} />
                <SegmentedControlItem value="udp" label={t.udpOnly} />
              </SegmentedControl>
            </HStack>
          )}
          {!canSelect && (
            <Text type="supporting" color="secondary">
              {t.policyNoPin}
            </Text>
          )}
        </VStack>
      </Section>
      <Divider />
      <Section variant="transparent" padding={pageRhythm.inset}>
        <VStack gap={pageRhythm.toolbarToCollection} className="lite-table-inset">
          <CollectionToolbar>
            <StackItem xstyle={inspectorStyles.search}>
              <CollectionSearch
                label={t.labelValue.replace('{label}', t.searchMembers).replace('{value}', group.name)}
                isLabelHidden
                placeholder={t.searchMembers}
                size="md"
                width="100%"
                startIcon={Search}
                value={search}
                onChange={setSearch}
              />
            </StackItem>
            {regionOptions.length > 0 && (
              <Selector
                label={t.region}
                isLabelHidden
                placeholder={t.region}
                size="md"
                width={144}
                hasClear
                value={region}
                options={regionOptions}
                renderValue={option => String(option.label ?? option.value)}
                xstyle={region !== null ? inspectorStyles.filled : undefined}
                onChange={value => setRegion(value || null)}
              />
            )}
            <Selector
              label={t.sort}
              aria-label={t.sort}
              isLabelHidden
              size="md"
              width={144}
              value={sort}
              options={[
                {value: 'latency', label: t.byLatency},
                {value: 'name', label: t.byName}
              ]}
              renderValue={option => String(option.label ?? option.value)}
              onChange={value => setSort(value ?? 'latency')}
            />
            <HStack gap={2} vAlign="center" style={{width: 'auto'}}>
              <ToggleButton
                label={t.onlyAvailable}
                size="md"
                isPressed={alive}
                xstyle={[inspectorStyles.chip, !alive && inspectorStyles.chipIdle]}
                onPressedChange={setAlive}
              />
              <HStack gap={2} vAlign="center" style={{width: 'auto'}}>
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  {t.memberCount.replace('{shown}', String(rows.length)).replace('{total}', String(observed.length))}
                </Text>
                {filters && (
                  <Link
                    type="supporting"
                    onClick={() => {
                      setSearch('');
                      setRegion(null);
                      setAlive(false);
                    }}
                  >
                    {t.clearAll}
                  </Link>
                )}
              </HStack>
              {probe && (
                <>
                  <Tooltip content={t.testLatency}>
                    <IconButton
                      label={`${t.testLatency}: ${group.name}`}
                      variant="ghost"
                      size="md"
                      icon={<Icon icon={Refresh} size="sm" />}
                      isLoading={pending === 'probe'}
                      isDisabled={disabled || pending !== null}
                      onClick={probe}
                    />
                  </Tooltip>
                </>
              )}
            </HStack>
          </CollectionToolbar>
          {observed.length === 0 ? (
            <EmptyState
              isCompact
              title={t.emptyGroupTitle}
              description={t.emptyGroupHelp}
              actions={edit ? <Button label={t.editMode} variant="secondary" onClick={edit} /> : undefined}
            />
          ) : (
            <RowEntrance>
              {rows.length ? (
                <VStack gap={pageRhythm.section}>
                  {nested.length > 0 && (
                    <VStack gap={2} data-member-section="groups">
                      <Text type="label" color="secondary">
                        {t.sectionCount.replace('{label}', t.groups).replace('{n}', String(nested.length))}
                      </Text>
                      <RadioList
                        label={t.groups}
                        isLabelHidden
                        value={selectedId ?? ''}
                        onChange={chooseRow}
                        isDisabled={deferredDisabled || !canSelect || deferredPending !== null}
                        width="100%"
                      >
                        {members(nested)}
                      </RadioList>
                    </VStack>
                  )}
                  {leaves.length > 0 && (
                    <VStack gap={2} data-member-section="nodes">
                      {nested.length > 0 && (
                        <Text type="label" color="secondary">
                          {t.sectionCount.replace('{label}', t.nodes).replace('{n}', String(leaves.length))}
                        </Text>
                      )}
                      <RadioList
                        label={t.nodes}
                        isLabelHidden
                        value={selectedId ?? ''}
                        onChange={chooseRow}
                        isDisabled={deferredDisabled || !canSelect || deferredPending !== null}
                        width="100%"
                      >
                        {members(pageRows)}
                      </RadioList>
                    </VStack>
                  )}
                </VStack>
              ) : (
                <EmptyState isCompact title={t.noMatches} description={t.noMatchesHelp} />
              )}
            </RowEntrance>
          )}
        </VStack>
      </Section>
    </VStack>
  );
}

export function GroupInspectorPlaceholder({count, nestedCount}: {count: number; nestedCount: number}) {
  const t = useMessages();
  const members = (length: number) =>
    Array.from({length}, (_, i) => (
      <RadioListItem
        key={i}
        value={String(i)}
        data-skeleton-row
        xstyle={inspectorStyles.member}
        label={<RowPlaceholder />}
        description={<RowPlaceholder supporting />}
        endContent={
          <HStack gap={2} vAlign="center" style={{width: 'auto'}}>
            <VStack xstyle={inspectorStyles.latency}>
              <RowPlaceholder width="var(--spacing-12)" />
            </VStack>
          </HStack>
        }
      />
    ));
  return (
    <VStack gap={0} aria-hidden="true" data-inspector-placeholder>
      <Section variant="transparent" padding={pageRhythm.inset}>
        <VStack gap={3}>
          <HStack gap={3} vAlign="center">
            <StackItem size="fill" style={{minWidth: 0}}>
              <VStack gap={1}>
                <Skeleton width="12ch" height="calc(var(--text-heading-2-size) * var(--text-heading-2-leading))" />
                <RowPlaceholder supporting />
                <RowPlaceholder supporting width="18ch" />
              </VStack>
            </StackItem>
            <Skeleton width="var(--size-element-sm)" height="var(--size-element-sm)" />
          </HStack>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <LoadingText type="supporting" color="secondary" loading children={t.network} />
            <SegmentedControl label={t.network} value="both" onChange={() => {}} size="md" isDisabled>
              <SegmentedControlItem value="both" label={t.both} style={{color: 'transparent'}} />
              <SegmentedControlItem value="tcp" label={t.tcpOnly} style={{color: 'transparent'}} />
              <SegmentedControlItem value="udp" label={t.udpOnly} style={{color: 'transparent'}} />
            </SegmentedControl>
          </HStack>
        </VStack>
      </Section>
      <Divider />
      <Section variant="transparent" padding={pageRhythm.inset}>
        <VStack gap={pageRhythm.toolbarToCollection} className="lite-table-inset">
          <CollectionToolbar>
            <StackItem xstyle={inspectorStyles.search}>
              <Skeleton width="100%" height="var(--size-element-md)" />
            </StackItem>
            <Skeleton width={144} height="var(--size-element-md)" />
            <Skeleton width={144} height="var(--size-element-md)" />
            <HStack gap={2} vAlign="center" style={{width: 'auto'}}>
              <HStack gap={0} className="lite-loading-control" style={{width: 'auto'}}>
                <ToggleButton label={t.onlyAvailable} size="md" isDisabled xstyle={[inspectorStyles.chip, inspectorStyles.chipIdle]} />
                <Skeleton className="lite-loading-shape" style={{opacity: 0.5, inset: 'var(--border-width)'}} />
              </HStack>
              <LoadingText type="supporting" color="secondary" hasTabularNumbers loading>
                {t.memberCount.replace('{shown}', String(count)).replace('{total}', String(count))}
              </LoadingText>
              <Skeleton width="var(--size-element-md)" height="var(--size-element-md)" />
            </HStack>
          </CollectionToolbar>
          <RowEntrance>
            <VStack gap={pageRhythm.section}>
              {nestedCount > 0 && (
                <VStack gap={2}>
                  <LoadingText type="label" color="secondary" loading>
                    {t.sectionCount.replace('{label}', t.groups).replace('{n}', String(nestedCount))}
                  </LoadingText>
                  <RadioList label={t.groups} isLabelHidden value="" onChange={() => {}} width="100%">
                    {members(nestedCount)}
                  </RadioList>
                </VStack>
              )}
              {count > nestedCount && (
                <VStack gap={2}>
                  {nestedCount > 0 && (
                    <LoadingText type="label" color="secondary" loading>
                      {t.sectionCount.replace('{label}', t.nodes).replace('{n}', String(count - nestedCount))}
                    </LoadingText>
                  )}
                  <RadioList label={t.nodes} isLabelHidden value="" onChange={() => {}} width="100%">
                    {members(Math.min(count - nestedCount, PAGE_SIZE))}
                  </RadioList>
                </VStack>
              )}
            </VStack>
          </RowEntrance>
        </VStack>
      </Section>
    </VStack>
  );
}
