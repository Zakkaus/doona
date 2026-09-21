import {useState} from 'react';
import {ListBox, ListBoxItem, ListBoxSection, Header} from 'react-aria-components';
import {useT} from '../../i18n';
import {useCapabilities, useConfig, useConnections, useGroups, useNodes, useProviders, useRules} from '../../api/store';
import {chainLabel, connectionRows} from '../../api/selectors';
import {Button, ModalDialog, TextField, ErrorMessage, Loading, Empty} from '../../ui/ui';
import Close from '../../ui/icons/Close';
import type {PageProps} from '../../features/types';
import {features, navAvailable, subpages} from '../registry';

type Hit = {id: string; label: string; desc: string | undefined; route: string; query: string};

export function SearchDialog({onClose, go}: {onClose: () => void; go: PageProps['go']}) {
  const t = useT();
  const [q, setQ] = useState('');
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const connections = useConnections(undefined, resources?.connections.available === true);
  const nodes = useNodes(resources?.nodes.available === true);
  const groups = useGroups(resources?.groups.available === true);
  const providers = useProviders(resources?.providers.available === true);
  const config = useConfig(resources?.config.available === true);
  const rules = useRules(resources?.rules.available === true);
  const needle = q.trim().toLowerCase();
  const limit = needle ? 8 : 5;
  const match = (...values: Array<string | null | undefined>) => values.some(value => value?.toLowerCase().includes(needle));
  const available = (path: string) => navAvailable(path, capabilities.data);
  const byId = new Map<string, Hit>();
  const hit = (id: string, label: string, desc: string | undefined, route: string, query = ''): Hit => {
    const item = {id, label, desc, route, query};
    byId.set(item.id, item);
    return item;
  };
  const places = [
    ...features
      .filter(feature => feature.nav && available(feature.path))
      .map(feature => ({route: feature.path, query: '', title: t(feature.nav!.titleKey), parent: ''})),
    ...subpages
      .filter(item => available(item.path))
      .map(item => ({route: item.path, query: item.query, title: t(item.titleKey), parent: t(features.find(f => f.path === item.path)!.nav!.titleKey)}))
  ];
  const sections = [
    {
      id: 'pages',
      title: t('search.pages'),
      items: places
        .filter(place => match(place.title, place.parent && place.parent + ' ' + place.title))
        .slice(0, limit)
        .map(place => hit(`page:${place.route}?${place.query}`, place.title, place.parent || undefined, place.route, place.query))
    },
    {
      id: 'conns',
      title: t('nav.connections'),
      items: connectionRows(connections.data)
        .filter(c => match(c.domain, c.dst, c.src))
        .slice(0, limit)
        .map(c => hit(`connection:${c.id}`, c.domain || c.dst || c.src || c.id, chainLabel(c, t), 'connections', 'id=' + encodeURIComponent(c.id)))
    },
    {
      id: 'nodes',
      title: t('search.nodes'),
      items: (nodes.data ?? [])
        .filter(n => match(n.name))
        .slice(0, limit)
        .map(n =>
          hit(
            `node:${n.id}`,
            n.name,
            n.group_ids.join(', ') || undefined,
            'nodes',
            (n.provider_id ? 'provider=' + encodeURIComponent(n.provider_id) + '&' : '') + 'q=' + encodeURIComponent(n.name)
          )
        )
    },
    {
      id: 'groups',
      title: t('search.groups'),
      items: (groups.data ?? [])
        .filter(g => match(g.name))
        .slice(0, limit)
        .map(g => hit(`group:${g.id}`, g.name, g.policy.native, 'policies', 'group=' + encodeURIComponent(g.id)))
    },
    {
      id: 'providers',
      title: t('search.providers'),
      items: (providers.data?.providers ?? [])
        .filter(p => match(p.name))
        .slice(0, limit)
        .map(p => hit(`provider:${p.id}`, p.name, t('search.nodeCount', {n: p.node_count}), 'nodes', 'provider=' + encodeURIComponent(p.id)))
    },
    {
      id: 'sources',
      title: t('search.sources'),
      items: (config.data?.sources ?? [])
        .filter(source => match(source.path))
        .slice(0, limit)
        .map(source => hit(`source:${source.id}`, source.path, source.kind, 'config', 'tab=source&source=' + encodeURIComponent(source.id)))
    },
    {
      id: 'rules',
      title: t('nav.rules'),
      items: (rules.data?.rules ?? [])
        .filter(rule => rule.kind === 'rule' && match(rule.expression, rule.outbound))
        .slice(0, limit)
        .map(rule =>
          hit(`rule:${rule.rule_id}`, rule.expression, `#${rule.index + 1} → ${rule.outbound}`, 'rules', 'tab=list&rule=' + encodeURIComponent(rule.rule_id))
        )
    }
  ];
  const sources = [capabilities, connections, nodes, groups, providers, config, rules];
  const error = sources.find(source => source.error)?.error;
  const loading = sources.some(source => source.loading && !source.data);
  return (
    <ModalDialog
      title={t('search')}
      hideTitle
      isOpen
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <div className="rp-toolbar">
        {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves into the dialog the user just opened */}
        <TextField search large label={t('search')} value={q} onChange={setQ} autoFocus className="rp-grow" />
        <Button quiet icon onPress={onClose} label={t('close')}>
          <Close />
        </Button>
      </div>
      {error && <ErrorMessage error={error} />}
      {byId.size === 0 && (loading ? <Loading /> : <Empty>{t('search.none')}</Empty>)}
      <ListBox
        aria-label={t('search')}
        className="rp-results"
        onAction={id => {
          const item = byId.get(String(id));
          if (!item) return;
          go(item.route, item.query);
          onClose();
        }}
      >
        {sections
          .filter(section => section.items.length > 0)
          .map(section => (
            <ListBoxSection key={section.id} id={section.id}>
              <Header className="rp-section-h">{section.title}</Header>
              {section.items.map(item => (
                <ListBoxItem key={item.id} id={item.id} className="rp-item plain" textValue={item.label}>
                  <span>{item.label}</span>
                  {item.desc && <span className="desc">{item.desc}</span>}
                </ListBoxItem>
              ))}
            </ListBoxSection>
          ))}
      </ListBox>
    </ModalDialog>
  );
}
