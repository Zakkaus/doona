import {Button} from '@astryxdesign/core/Button';
import {CommandPalette, CommandPaletteInput} from '@astryxdesign/core/CommandPalette';
import {Kbd} from '@astryxdesign/core/Kbd';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {HStack, StackItem, VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {createStaticSource} from '@astryxdesign/core/Typeahead';
import {useCallback, useEffect, useRef, useState} from 'react';
import {readProviders, type Connection} from './api';
import {usePreferences} from './app/preferences';
import {readNodes} from './config';
import {describeRule, describeTarget, phraseText} from './describe';
import {localeNames, useMessages, type Locale} from './i18n';
import {resourceIndex, searchNameRank, type ResourceResult} from './searchIndex';
import {useRead} from './state';
import {dispatchCommand, jumpToResource, requestPageCommand} from './ui/commands';
import {EditDialog} from './ui/EditDialog';
import {policyLabel} from './ui/groupLabels';
import {geometry} from './ui/metrics.stylex';
import {RowEntrance} from './ui/motion';
import {shortcuts} from './ui/shortcuts';
export default function Commands({
  connection,
  close,
  settings,
  blocked,
  help = false
}: {
  connection: Connection;
  close: () => void;
  settings: () => void;
  blocked: boolean;
  help?: boolean;
}) {
  const t = useMessages();
  const touch = useMediaQuery('(hover: none) and (pointer: coarse)');
  const preferences = usePreferences();
  const [showHelp, setShowHelp] = useState(help);
  const openingHelp = useRef(false);
  const [detail, setDetail] = useState<ResourceResult | null>(null);
  const navigated = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const read = useRead(
    useCallback(
      (signal?: AbortSignal) => (connection.capabilities.resources.runtime.available ? connection.api.runtime(signal) : Promise.resolve(undefined)),
      [connection]
    )
  );
  const caps = connection.capabilities.resources;
  const loadResources = useCallback(
    async (signal?: AbortSignal) => {
      const [nodes, groups, providers, config] = await Promise.allSettled([
        caps.nodes.available ? readNodes(connection, signal) : Promise.resolve([]),
        caps.groups.available ? connection.api.groups(signal) : Promise.resolve([]),
        caps.providers.available ? readProviders(connection.api, signal) : Promise.resolve([]),
        caps.config.available ? connection.api.config(signal) : Promise.resolve({sources: []})
      ]);
      return {
        items: resourceIndex(
          nodes.status === 'fulfilled' ? nodes.value : [],
          groups.status === 'fulfilled' ? groups.value : [],
          providers.status === 'fulfilled' ? providers.value : [],
          config.status === 'fulfilled' ? config.value.sources : [],
          t.manualLabel
        ),
        partial: [nodes, groups, providers, config].some(value => value.status === 'rejected')
      };
    },
    [connection, caps, t.manualLabel]
  );
  const pendingResources = useRef<ReturnType<typeof loadResources> | null>(null);
  const load = useCallback(() => (pendingResources.current ??= loadResources()), [loadResources]);
  const resources = useRead(load);
  const commands: Array<{id: string; label: string; run: () => void; auxiliaryData: {group: string}; resource?: ResourceResult; keywords?: string[]}> = [];
  const add = (id: string, label: string, group: string, run: () => void) => commands.push({id, label, run, auxiliaryData: {group}});
  for (const page of ['groups', 'subscriptions', 'nodes', 'routing', 'dns'] as const)
    if (caps[page === 'subscriptions' ? 'providers' : page === 'routing' || page === 'dns' ? 'config' : page].available)
      add(page, t[page], t.navigation, () => {
        location.hash = page;
      });
  if (!blocked && caps.config.writable && caps.config_validate.available && caps.operations.available) {
    for (const [id, label, page] of [
      ['add-node', t.addNode, 'nodes'],
      ['add-rule', t.addRule, 'routing'],
      ['add-group', t.createGroup, 'groups']
    ] as const)
      add(id, label, t.actions, () => {
        location.hash = page;
        requestPageCommand(id);
      });
  }
  const state = read.data?.lifecycle.state;
  if (!blocked && caps.operations.available && !read.loading && !read.error)
    for (const kind of ['suspend', 'resume', 'reload'] as const) {
      if (
        caps[kind]?.available &&
        (kind === 'resume'
          ? state === 'suspended'
          : kind === 'suspend'
            ? ['running', 'degraded'].includes(state ?? '')
            : ['running', 'degraded', 'failed'].includes(state ?? ''))
      )
        add(`backend:${kind}`, t[kind === 'suspend' ? 'pauseBackend' : kind === 'resume' ? 'resumeBackend' : 'reloadBackend'], t.backendActions, () =>
          dispatchCommand(`backend:${kind}`)
        );
    }
  add('settings', t.settings, t.actions, settings);
  for (const mode of ['light', 'dark', 'system'] as const) add(`theme:${mode}`, t[mode], t.appearance, () => preferences.setMode(mode));
  for (const [locale, label] of Object.entries(localeNames) as [Locale, string][])
    add(`language:${locale}`, label, t.language, () => preferences.setLocale(locale));
  add('help', t.shortcuts, t.actions, () => setShowHelp(true));
  // Rules read as plain phrases; their dae text stays searchable as a keyword.
  const ruleLabel = (rule: NonNullable<ResourceResult['rule']>) =>
    rule.fallback
      ? t.labelValue.replace('{label}', rule.kind === 'routing' ? t.fallback : t.dnsFallback).replace('{value}', phraseText(describeTarget(rule.target), t))
      : phraseText(describeRule(rule.conditions, rule.target), t);
  const resultItems = (items: ResourceResult[]) => [
    ...items.map(resource => ({
      id: resource.id,
      label: resource.rule ? ruleLabel(resource.rule) : resource.label,
      keywords: [resource.label, resource.description, ...(resource.keywords ?? [])],
      auxiliaryData: {group: t[resource.category]},
      resource,
      run: () => jumpToResource(resource.target)
    })),
    ...commands.map(command => ({...command, auxiliaryData: {group: t.actions}}))
  ];
  const found = useRef<ReturnType<typeof resultItems>>([]);
  const queryItems = async (query: string, limit: number) => {
    const data = await load();
    const results = resultItems(data.items);
    found.current = results;
    const matches = createStaticSource(results, {keywords: item => item.keywords ?? []}).search(query);
    const counts = new Map<string, number>();
    const shown = (await matches)
      .sort((a, b) => searchNameRank(a.label, query) - searchNameRank(b.label, query))
      .filter(item => {
        const group = item.auxiliaryData.group;
        const count = counts.get(group) ?? 0;
        counts.set(group, count + 1);
        return count < limit;
      });
    return shown;
  };
  const execute = (item: ReturnType<typeof resultItems>[number] | undefined) => {
    if (!item || !active.current) return;
    if (item.id === 'help') {
      openingHelp.current = true;
      setShowHelp(true);
    } else if (item.resource?.preview !== undefined) {
      openingHelp.current = true;
      setDetail(item.resource);
    } else {
      close();
      item.run();
    }
  };
  const source = {bootstrap: () => queryItems('', 4), search: (query: string) => queryItems(query, Infinity)};
  return (
    <>
      {!showHelp && !detail && (
        <RowEntrance>
          <CommandPalette
            isOpen
            style={{height: geometry.searchHeight}}
            label={t.globalSearch}
            input={
              <CommandPaletteInput
                label={t.globalSearch}
                placeholder={t.searchEverything}
                onChange={() => {
                  navigated.current = false;
                }}
                onKeyDownCapture={event => {
                  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                    navigated.current = true;
                    return;
                  }
                  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const selected = navigated.current
                    ? document.getElementById(event.currentTarget.getAttribute('aria-activedescendant') ?? '')?.getAttribute('data-value')
                    : undefined;
                  if (selected) execute(found.current.find(item => item.id === selected));
                  else void queryItems(event.currentTarget.value, Infinity).then(items => execute(items[0]));
                }}
              />
            }
            footer={
              <HStack gap={3} padding={3} wrap="wrap">
                <Text type="supporting" color="secondary">
                  {resources.loading ? t.searchLoading : resources.data?.partial || resources.error ? t.searchPartial : t.searchEverything}
                </Text>
                {!touch && <Kbd keys="mod+k" />}
              </HStack>
            }
            renderItem={item => (
              <HStack gap={3} width="100%" vAlign="center">
                <StackItem size="fill" style={{minWidth: 0}}>
                  <VStack gap={1}>
                    <Text style={{overflowWrap: 'anywhere'}}>{item.label}</Text>
                    {item.resource && (
                      <Text type="supporting" color="secondary" style={{overflowWrap: 'anywhere'}}>
                        {item.resource.category === 'groups' ? policyLabel(item.resource.description, t) : item.resource.description}
                      </Text>
                    )}
                  </VStack>
                </StackItem>
                {item.resource?.target.kind === 'node' && caps.groups.available && (
                  <Button
                    label={t.useInGroup}
                    variant="secondary"
                    size="sm"
                    onClick={event => {
                      event.stopPropagation();
                      close();
                      jumpToResource({kind: 'member', id: item.resource!.target.id});
                    }}
                  />
                )}
                {item.resource?.target.kind === 'group' && (
                  <Button
                    label={t.switchNode}
                    variant="secondary"
                    size="sm"
                    onClick={event => {
                      event.stopPropagation();
                      close();
                      item.run();
                    }}
                  />
                )}
              </HStack>
            )}
            searchSource={source}
            emptySearchText={t.noMatches}
            onOpenChange={open => {
              if (!open && !openingHelp.current) close();
            }}
            onValueChange={id => execute(found.current.find(item => item.id === id))}
          />
        </RowEntrance>
      )}
      <EditDialog open={!!detail} title={detail?.label ?? t.globalSearch} close={close} pending={false} label={t.close} confirm={close}>
        <Text type="supporting" color="secondary">
          {t.readOnly}
        </Text>
        <VStack data-code-editor>
          <TextArea label={detail?.description || t.generatedRule} value={detail?.preview ?? ''} isReadOnly rows={8} />
        </VStack>
      </EditDialog>
      <EditDialog open={showHelp} title={t.shortcuts} close={close} pending={false} label={t.close} confirm={close}>
        <Text>{t.shortcutsHelp}</Text>
        <RowEntrance>
          <VStack as="ul" gap={0}>
            {!touch && (
              <HStack as="li" padding={3} gap={3}>
                <Kbd keys="mod+k" />
                <Text>{t.globalSearch}</Text>
              </HStack>
            )}
            {Object.entries(shortcuts).map(([key, page]) => (
              <HStack as="li" padding={3} gap={3} key={key}>
                <Kbd keys={key} />
                <Text>{t[page]}</Text>
              </HStack>
            ))}
            <HStack as="li" padding={3} gap={3}>
              <Kbd keys="?" />
              <Text>{t.shortcuts}</Text>
            </HStack>
          </VStack>
        </RowEntrance>
      </EditDialog>
    </>
  );
}
