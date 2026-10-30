import {Button} from '@astryxdesign/core/Button';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {HStack, Layout, LayoutContent, LayoutFooter, VStack} from '@astryxdesign/core/Layout';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {Text} from '@astryxdesign/core/Text';
import {CollectionSearch} from './ui/CollectionToolbar';
import {useToast} from '@astryxdesign/core/Toast';
import {useState} from 'react';
import type {Node, Provider} from '../../../src/api/model';
import {compileFilters} from '../../../src/dae/groupFilters';
import {readGroupEntries, writeGroupEntry} from '../../../src/dae/groups';
import {EMPTY_GROUP_FILTER, nodeBinding} from './groupBindings';
import {useMessages} from './i18n';
import {EditDialog} from './ui/EditDialog';
import {RowEntrance} from './ui/motion';

export function AddNodeToGroup({
  node,
  providers,
  content,
  stage,
  close
}: {
  node: Node;
  providers: Provider[];
  content: string;
  stage: (content: string, key: string, summary: string) => void;
  close: () => void;
}) {
  const t = useMessages();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const entries = readGroupEntries(content);
  const groups = entries.filter(entry => entries.filter(other => other.name === entry.name).length === 1);
  const contains = (entry: (typeof groups)[number]) => compileFilters(entry.filters)(node);
  const chosen = groups.find(entry => entry.name === selected);
  const filtered = groups.filter(entry => entry.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  if (!groups.length || groups.every(contains)) {
    return (
      <Dialog isOpen onOpenChange={open => !open && close()} width={480} maxHeight="85dvh">
        <Layout
          header={<DialogHeader title={t.addNodeToGroupTitle} onOpenChange={close} />}
          content={
            <LayoutContent>
              <VStack gap={4}>
                <Text>{node.name || node.id}</Text>
                <EmptyState
                  title={groups.length ? t.groupGuidanceAllContained : t.noEditableGroups}
                  description={groups.length ? t.groupGuidanceAllContainedHelp : t.groupGuidanceNoEditable}
                />
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} justify="end" wrap="wrap">
                <Button label={t.close} variant="secondary" onClick={close} />
                {!groups.length && (
                  <Button
                    label={t.groupGuidanceCreate}
                    variant="primary"
                    onClick={() => {
                      close();
                      location.hash = 'groups';
                    }}
                  />
                )}
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    );
  }
  return (
    <EditDialog
      title={t.addNodeToGroupTitle}
      width={480}
      open
      close={close}
      pending={false}
      label={t.add}
      disabled={!chosen || contains(chosen)}
      disabledReason={t.chooseGroup}
      confirm={() => {
        if (!chosen || contains(chosen)) return;
        const filter = nodeBinding(node, providers, t.node).filter;
        const next = writeGroupEntry(content, chosen.name, {
          policy: chosen.policy,
          filters: [...chosen.filters.filter(item => item !== EMPTY_GROUP_FILTER), filter]
        });
        const summary = t.nodeAddedToGroup.replace('{node}', node.name || node.id).replace('{group}', chosen.name);
        stage(next, `group:${chosen.name}:${node.id}`, summary);
        toast({body: summary});
        close();
      }}
    >
      <Text>{node.name || node.id}</Text>
      <Text type="supporting" color="secondary">
        {t.featureDraftHelp}
      </Text>
      {groups.length > 8 && <CollectionSearch label={t.searchGroups} placeholder={t.searchGroups} value={query} onChange={setQuery} />}
      <RowEntrance>
        <RadioList label={t.groups} value={selected} onChange={setSelected}>
          {filtered.map(group => (
            <RadioListItem
              key={group.name}
              value={group.name}
              label={group.name}
              isDisabled={contains(group)}
              description={contains(group) ? t.alreadyInGroup : undefined}
            />
          ))}
        </RadioList>
      </RowEntrance>
      {!filtered.length && <EmptyState title={t.noMatches} description={t.noMatchesHelp} />}
    </EditDialog>
  );
}
