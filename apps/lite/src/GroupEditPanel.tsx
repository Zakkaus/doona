// Copyright (c) Meta Platforms, Inc. and affiliates.
// Member transfer list adapted from the Astryx table-filter template's Columns panel; see ASTRYX-TEMPLATES-LICENSE.

import {Button} from '@astryxdesign/core/Button';
import {Banner} from '@astryxdesign/core/Banner';
import {Divider} from '@astryxdesign/core/Divider';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {HStack, StackItem, VStack} from '@astryxdesign/core/Layout';
import {Item} from '@astryxdesign/core/Item';
import {List} from '@astryxdesign/core/List';
import {RowMenu as MoreMenu} from './ui/RowMenu';
import {Section} from '@astryxdesign/core/Section';
import {Selector} from '@astryxdesign/core/Selector';
import {Switch} from '@astryxdesign/core/Switch';
import {Heading, Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {CollectionSearch} from './ui/CollectionToolbar';
import * as stylex from '@stylexjs/stylex';
import {useEffect, useRef, useState, type KeyboardEvent, type PointerEvent} from 'react';
import type {Node, Provider} from '../../../src/api/model';
import {compileFilters} from '../../../src/dae/groupFilters';
import {readGroupEntries, writeGroupEntry} from '../../../src/dae/groups';
import {errorKey} from './api';
import {phraseText, describeGroupFilter} from './describe';
import {GroupBindPopover} from './GroupBindPopover';
import {EMPTY_GROUP_FILTER, honkPolicy, readSubscriptionBinding, type Binding, type SubscriptionBinding} from './groupBindings';
import {renameGroup} from './groupDraft';
import {memberOptions} from './groupMembers';
import {useMessages} from './i18n';
import {useDragItems} from './ui/DragItems';
import {policyLabel} from './ui/groupLabels';
import {Add, Close, DragHandle} from './ui/icons';
import {MEDIA} from './ui/metrics.stylex';
import {RowEntrance} from './ui/motion';
import {revealRow} from './ui/motion/revealRow';
import {usePaged} from './ui/usePaged';

const styles = stylex.create({
  box: {
    borderWidth: 'var(--border-width)',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-container)',
    overflow: 'hidden',
    minWidth: 0
  },
  panel: {flexBasis: 0, flexGrow: 1, minWidth: 0},
  divider: {borderInlineStartWidth: 'var(--border-width)', borderInlineStartStyle: 'solid', borderInlineStartColor: 'var(--color-border)'},
  dividerTop: {borderBlockStartWidth: 'var(--border-width)', borderBlockStartStyle: 'solid', borderBlockStartColor: 'var(--color-border)'},
  header: {borderBlockEndWidth: 'var(--border-width)', borderBlockEndStyle: 'solid', borderBlockEndColor: 'var(--color-border)'},
  // 16px against the box edge, 12px against the rule between panels, as in the template.
  padStart: {paddingInlineStart: 'var(--spacing-4)', paddingInlineEnd: 'var(--spacing-3)'},
  padEnd: {paddingInlineStart: 'var(--spacing-3)', paddingInlineEnd: 'var(--spacing-4)'},
  grip: {marginInlineStart: 'calc(-1 * var(--spacing-1-5))', cursor: 'grab', touchAction: 'none'},
  endAction: {marginInlineEnd: 'calc(-1 * var(--spacing-1-5))'},
  picked: {backgroundColor: 'var(--color-accent-muted)'},
  dragging: {opacity: 0.5, userSelect: 'none'},
  dropBefore: {boxShadow: 'inset 0 var(--spacing-0-5) 0 var(--color-accent)'},
  dropAfter: {boxShadow: 'inset 0 calc(-1 * var(--spacing-0-5)) 0 var(--color-accent)'},
  empty: {textAlign: 'center'},
  wrap: {overflowWrap: 'anywhere', minWidth: 0}
});

type Session = {filter: string; from: number; to: number; pointer?: number; startY?: number; moved?: boolean};

export function GroupEditPanel({
  name,
  content,
  original,
  others,
  nodes,
  providers,
  writable,
  sheet,
  stage,
  renamed,
  menu
}: {
  name: string;
  content: string;
  original: string;
  others: string[];
  nodes: Node[];
  providers: Provider[];
  writable: boolean;
  sheet: boolean;
  stage: (content: string) => void;
  renamed: (name: string) => void;
  menu: Array<{label: string; onClick: () => void}>;
}) {
  const t = useMessages();
  const stacked = useMediaQuery(MEDIA.phone);
  const [query, setQuery] = useState('');
  const [nameDraft, setNameDraft] = useState(name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const [reveal, setReveal] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const drag = useDragItems(() => {});
  const entry = readGroupEntries(content).find(item => item.name === name);
  const before = readGroupEntries(original).find(item => item.name === name);
  const {options, matchable} = memberOptions({original, content, nodes, providers, labels: {node: t.node, subscription: t.subscriptions}});
  const filters = entry?.filters ?? [];
  const allNodes = !!entry && filters.length === 0;
  const chosen = filters.filter(filter => filter !== EMPTY_GROUP_FILTER);
  const describe = (filter: string) => {
    const phrase = describeGroupFilter(filter);
    return phrase ? phraseText(phrase, t) : t.descNone;
  };
  // Known nodes keep their name and source; subscription bindings and other filters read as plain phrases.
  const members: Array<Binding & {binding: SubscriptionBinding | null}> = chosen.map(filter => {
    const binding = readSubscriptionBinding(filter);
    const known = options.find(item => item.filter === filter);
    if (known && !known.provider) return {...known, binding};
    if (binding) return {id: `filter:${filter}`, label: binding.source, description: describe(filter), filter, binding};
    return {id: `filter:${filter}`, label: describe(filter), description: t.memberFilter, filter, binding};
  });
  const subscriptionNames = (provider: Binding) => nodes.filter(node => node.subscription_tag === provider.label).map(node => node.name);
  const available = options.filter(
    item => !chosen.includes(item.filter) && `${item.label} ${item.description}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  );
  const memberPage = usePaged(members, 10);
  const availablePage = usePaged(available, 10);
  useEffect(() => {
    if (!reveal) return;
    const frame = requestAnimationFrame(() => {
      const row = rowRefs.current.get(reveal);
      if (!row) return;
      revealRow(row, true);
      setReveal(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [reveal, memberPage.pageRows]);
  const matched = entry ? matchable.filter(compileFilters(filters)).length : 0;
  const shownPolicy = honkPolicy(entry?.policy ?? 'select');
  const policies = [...new Set([shownPolicy, 'select', 'urltest', 'roundrobin', 'fallback', 'score'])];
  const editable = writable && !!entry;
  const write = (next: string[]) => stage(writeGroupEntry(content, name, {policy: entry?.policy ?? null, filters: next.length ? next : [EMPTY_GROUP_FILTER]}));
  const focusRow = (selector: string) => () =>
    root.current?.querySelector<HTMLElement>(selector) ?? root.current?.querySelector<HTMLElement>('[data-transfer="members"] button') ?? null;
  const add = (items: Binding[]) => {
    if (!editable || allNodes || !items.length) return;
    const added = items.map(item => item.filter);
    const next = [...new Set([...chosen, ...added])];
    write(next);
    memberPage.showIndex(next.indexOf(added[0]));
    setReveal(added[0]);
    drag.finish(t.memberAdded.replace('{name}', items.map(item => item.label).join(', ')), () => null);
  };
  const replace = (from: string, to: string, label: string) => {
    if (!editable || allNodes) return;
    write([...new Set(chosen.map(filter => (filter === from ? to : filter)))]);
    drag.finish(t.memberAdded.replace('{name}', label), focusRow(`[data-member-filter="${CSS.escape(to)}"] button`));
  };
  const remove = (item: Binding) => {
    if (!editable || allNodes) return;
    write(chosen.filter(filter => filter !== item.filter));
    drag.finish(t.memberRemoved.replace('{name}', item.label), () => {
      focusRow('[data-transfer="available"] [data-add-member]')()?.focus({preventScroll: true});
      return null;
    });
  };
  const move = (filter: string, index: number) => {
    const from = chosen.indexOf(filter);
    const to = Math.max(0, Math.min(chosen.length - 1, index));
    if (from < 0 || from === to) return;
    const next = [...chosen];
    next.splice(from, 1);
    next.splice(to, 0, filter);
    write(next);
    drag.finish(
      t.memberMoved.replace('{name}', members[from].label).replace('{n}', String(to + 1)),
      focusRow(`[data-member-filter="${CSS.escape(filter)}"] [data-grip]`)
    );
  };
  const begin = (next: Session | null) => {
    sessionRef.current = next;
    setSession(next);
  };
  const gripKeys = (event: KeyboardEvent<HTMLButtonElement>, filter: string) => {
    const index = chosen.indexOf(filter);
    const target = {ArrowUp: index - 1, ArrowDown: index + 1, Home: 0, End: chosen.length - 1}[event.key];
    if (target === undefined) return;
    event.preventDefault();
    move(filter, target);
  };
  const gripDown = (event: PointerEvent<HTMLButtonElement>, filter: string) => {
    if (event.button !== 0 || !editable) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const index = chosen.indexOf(filter);
    begin({filter, from: index, to: index, pointer: event.pointerId, startY: event.clientY, moved: false});
  };
  const gripMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = sessionRef.current;
    if (!current || current.pointer !== event.pointerId) return;
    if (!current.moved && Math.abs(event.clientY - (current.startY ?? 0)) < 4) return;
    const rest = chosen.filter(filter => filter !== current.filter);
    let to = rest.length;
    for (let i = 0; i < rest.length; i++) {
      const box = rowRefs.current.get(rest[i])?.getBoundingClientRect();
      if (box && event.clientY < box.top + box.height / 2) {
        to = i;
        break;
      }
    }
    if (!current.moved || current.to !== to) begin({...current, moved: true, to});
  };
  const gripUp = (event: PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const current = sessionRef.current;
    if (!current || current.pointer !== event.pointerId) return;
    begin(null);
    if (!cancelled && current.moved && current.to !== current.from) move(current.filter, current.to);
  };
  const rest = session?.moved ? chosen.filter(filter => filter !== session.filter) : [];
  const drop =
    session?.moved && session.to !== session.from
      ? rest[session.to]
        ? {filter: rest[session.to], side: 'before' as const}
        : {filter: rest.at(-1), side: 'after' as const}
      : null;
  const commitName = () => {
    const next = nameDraft.trim();
    if (!entry || next === name) {
      setNameError(null);
      return;
    }
    try {
      stage(renameGroup(content, others, name, next));
      setNameError(null);
      renamed(next);
    } catch (error) {
      setNameError(t[errorKey(error)]);
    }
  };
  const panelHeader = (pane: 'members' | 'available') => (
    <HStack gap={2} vAlign="center" hAlign="between" paddingBlock={2} xstyle={[styles.header, pane === 'members' || stacked ? styles.padStart : styles.padEnd]}>
      <Text id={`group-${pane}`} type="label" color="secondary">
        {pane === 'members' ? t.sectionCount.replace('{label}', t.groupMembers).replace('{n}', String(members.length)) : t.availableMembers}
      </Text>
      {pane === 'members' ? (
        <Button
          label={t.restore}
          variant="ghost"
          size="sm"
          isDisabled={!editable || (before?.filters ?? [EMPTY_GROUP_FILTER]).join('\n') === filters.join('\n')}
          onClick={() => {
            stage(writeGroupEntry(content, name, {policy: entry?.policy ?? null, filters: before?.filters ?? [EMPTY_GROUP_FILTER]}));
            drag.finish(t.membersRestored, focusRow('[data-transfer="members"] button'));
          }}
        />
      ) : (
        <Button label={t.selectAll} variant="ghost" size="sm" isDisabled={!editable || allNodes || !available.length} onClick={() => add(available)} />
      )}
    </HStack>
  );
  const emptyRow = (text: string, pane: 'members' | 'available') => (
    <VStack gap={0} paddingBlock={4} xstyle={[styles.empty, pane === 'members' || stacked ? styles.padStart : styles.padEnd]}>
      <Text type="supporting" color="secondary">
        {text}
      </Text>
    </VStack>
  );
  if (!entry) return null;
  const Pair = stacked ? VStack : HStack;
  return (
    <VStack gap={0} ref={root} data-group-editor={name}>
      <Section variant="transparent" padding={4} paddingBlockStart={sheet ? 0 : 4}>
        <HStack gap={3} vAlign="center">
          <StackItem size="fill" style={{minWidth: 0}}>
            <VStack gap={1}>
              <Heading level={2} xstyle={styles.wrap}>
                {name}
              </Heading>
              <Text type="supporting" color="secondary">
                {t.labelValue
                  .replace('{label}', policyLabel(entry.policy ?? 'select', t))
                  .replace('{value}', (matched === 1 ? t.matchedNodesOne : t.matchedNodes).replace('{n}', String(matched)))}
              </Text>
            </VStack>
          </StackItem>
          <MoreMenu label={`${t.actions}: ${name}`} variant="ghost" size="sm" alignment="end" isDisabled={!editable} items={menu} />
        </HStack>
      </Section>
      <Divider />
      <Section variant="transparent" padding={4}>
        <VStack gap={4}>
          <TextInput
            label={t.name}
            value={nameDraft}
            onChange={value => {
              setNameDraft(value);
              setNameError(null);
            }}
            onBlur={commitName}
            onKeyDown={event => {
              if (event.key === 'Enter') commitName();
            }}
            isDisabled={!editable}
            status={nameError ? {type: 'error', message: nameError} : undefined}
          />
          <Selector
            label={t.policy}
            value={shownPolicy}
            options={policies.map(value => ({value, label: policyLabel(value, t)}))}
            onChange={value => value && stage(writeGroupEntry(content, name, {policy: value === 'select' ? null : value, filters}))}
            isDisabled={!editable}
          />
          {['min', 'random', 'fixed(0)'].includes(entry.policy ?? '') && (
            <Text type="supporting" color="secondary">
              {t.legacyPolicy}
            </Text>
          )}
          <Switch
            label={t.allNodes}
            description={t.memberHelp}
            value={allNodes}
            onChange={value => stage(writeGroupEntry(content, name, {policy: entry.policy, filters: value ? [] : [EMPTY_GROUP_FILTER]}))}
            isDisabled={!editable}
          />
          {!before && !allNodes && chosen.length === 0 && (
            <Banner status="info" title={sheet ? t.nextStepSheet : t.nextStep} collapsible={false} data-next-step />
          )}
          <VStack gap={0} xstyle={styles.box}>
            <Pair gap={0}>
              <VStack gap={0} role="group" aria-labelledby="group-members" data-transfer="members" xstyle={styles.panel}>
                {panelHeader('members')}
                {allNodes ? (
                  emptyRow(t.allNodesIncluded, 'members')
                ) : members.length === 0 ? (
                  emptyRow(t.emptyMembers, 'members')
                ) : (
                  <RowEntrance>
                    <List density="compact">
                      {memberPage.pageRows.map(item => (
                        <Item
                          as="li"
                          density="compact"
                          key={item.filter}
                          data-member-filter={item.filter}
                          tabIndex={-1}
                          ref={node => {
                            if (node) rowRefs.current.set(item.filter, node);
                            else rowRefs.current.delete(item.filter);
                          }}
                          label={item.label}
                          labelLines={4}
                          description={item.description}
                          startContent={
                            <IconButton
                              label={t.dragItem.replace('{name}', item.label)}
                              data-grip
                              aria-pressed={session?.filter === item.filter}
                              variant="ghost"
                              size="sm"
                              isDisabled={!editable}
                              icon={<Icon icon={DragHandle} size="sm" />}
                              xstyle={styles.grip}
                              onKeyDown={event => gripKeys(event, item.filter)}
                              onPointerDown={event => gripDown(event, item.filter)}
                              onPointerMove={gripMove}
                              onPointerUp={event => gripUp(event, false)}
                              onPointerCancel={event => gripUp(event, true)}
                            />
                          }
                          endContent={
                            <HStack gap={0} vAlign="center" style={{width: 'auto'}}>
                              {item.binding && (
                                <GroupBindPopover
                                  name={item.binding.source}
                                  names={subscriptionNames({...item, label: item.binding.source})}
                                  initial={item.binding}
                                  disabled={!editable}
                                  submit={next => replace(item.filter, next, item.binding!.source)}
                                />
                              )}
                              <IconButton
                                label={`${t.removeMember}: ${item.label}`}
                                variant="ghost"
                                size="sm"
                                isDisabled={!editable}
                                icon={<Icon icon={Close} size="sm" />}
                                xstyle={styles.endAction}
                                onClick={() => remove(item)}
                              />
                            </HStack>
                          }
                          xstyle={[
                            styles.padStart,
                            session?.moved && session.filter === item.filter && styles.dragging,
                            drop?.filter === item.filter && (drop.side === 'before' ? styles.dropBefore : styles.dropAfter)
                          ]}
                        />
                      ))}
                    </List>
                  </RowEntrance>
                )}
                {memberPage.pager && (
                  <VStack gap={0} padding={2}>
                    {memberPage.pager}
                  </VStack>
                )}
              </VStack>
              <VStack
                gap={0}
                role="group"
                aria-labelledby="group-available"
                data-transfer="available"
                xstyle={[styles.panel, stacked ? styles.dividerTop : styles.divider]}
              >
                {panelHeader('available')}
                <VStack gap={0} paddingBlock={3} xstyle={stacked ? styles.padStart : styles.padEnd}>
                  <CollectionSearch
                    label={t.searchMembers}
                    isLabelHidden
                    placeholder={t.searchMembers}
                    width="100%"
                    value={query}
                    onChange={setQuery}
                    isDisabled={allNodes}
                  />
                </VStack>
                {available.length === 0 ? (
                  emptyRow(t.noMatches, 'available')
                ) : (
                  <RowEntrance>
                    <List density="compact">
                      {availablePage.pageRows.map(item => (
                        <Item
                          as="li"
                          density="compact"
                          key={item.id}
                          label={item.label}
                          labelLines={4}
                          description={item.description}
                          endContent={
                            item.provider ? (
                              <GroupBindPopover
                                name={item.label}
                                names={subscriptionNames(item)}
                                initial={null}
                                disabled={!editable || allNodes}
                                triggerStyle={styles.endAction}
                                submit={filter => add([{...item, filter}])}
                              />
                            ) : (
                              <IconButton
                                label={`${t.addMember}: ${item.label}`}
                                data-add-member
                                variant="ghost"
                                size="sm"
                                isDisabled={!editable || allNodes}
                                icon={<Icon icon={Add} size="sm" />}
                                xstyle={styles.endAction}
                                onClick={() => add([item])}
                              />
                            )
                          }
                          xstyle={stacked ? styles.padStart : styles.padEnd}
                        />
                      ))}
                    </List>
                  </RowEntrance>
                )}
                {availablePage.pager && (
                  <VStack gap={0} padding={2}>
                    {availablePage.pager}
                  </VStack>
                )}
              </VStack>
            </Pair>
          </VStack>
        </VStack>
      </Section>
      {drag.live}
    </VStack>
  );
}
