import type {Node} from '../../../src/api/model';
import {RowMenu} from './ui/RowMenu';
import {Button} from '@astryxdesign/core/Button';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {List, ListItem} from '@astryxdesign/core/List';
import {VStack} from '@astryxdesign/core/Stack';
import {TextInput} from '@astryxdesign/core/TextInput';
import {LoadingText, loadingControl} from './ui/LoadingText';
import {useCallback, useState} from 'react';
import type {Connection} from './api';
import {readNodes} from './config';
import {useMessages} from './i18n';
import {useRead} from './state';
import {ReadState} from './ui';
import {CollectionLoading, RowPlaceholder} from './ui/CollectionLoading';
import {CollectionToolbar} from './ui/CollectionToolbar';
import {pageRhythm} from './ui/PageFrame';
import {RowEntrance} from './ui/motion';
import {usePaged} from './ui/usePaged';

export function SubscriptionFeatureNodes({
  connection,
  provider,
  version,
  count,
  loading = false,
  edit,
  addToGroup
}: {
  connection: Connection;
  provider: string;
  version?: string;
  count: number;
  loading?: boolean;
  edit?: () => void;
  addToGroup?: (node: Node) => void;
}) {
  const t = useMessages();
  const [search, setSearch] = useState('');
  const read = useRead(
    useCallback((signal?: AbortSignal) => readNodes(connection, signal), [connection]),
    version
  );
  const nodes = read.data?.filter(node => node.provider_id === provider);
  const filtered = (nodes ?? []).filter(node => `${node.name} ${node.protocol}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const {pageRows, pager} = usePaged(filtered);
  return (
    <VStack gap={pageRhythm.toolbarToCollection} className="lite-table-inset">
      <ReadState error={read.error} reload={read.reload} />
      {(nodes?.length ?? count) > 20 && (
        <CollectionToolbar
          start={
            <TextInput
              label={t.searchNodes}
              isLabelHidden
              placeholder={t.searchNodes}
              value={search}
              onChange={setSearch}
              isDisabled={!nodes}
              hasClear
              width="100%"
            />
          }
        />
      )}
      <CollectionLoading loading={!nodes && read.loading} name="subscription-nodes">
        <RowEntrance>
          <List density="compact" hasDividers data-subscription-nodes data-collection>
            {!nodes &&
              read.loading &&
              Array.from({length: Math.min(count, 20)}, (_, i) => (
                <ListItem key={i} data-skeleton-row label={<RowPlaceholder />} description={<RowPlaceholder supporting />} />
              ))}
            {pageRows.map(node => (
              <ListItem
                key={node.id}
                endContent={
                  <RowMenu
                    {...loadingControl(loading, 'icon')}
                    label={`${t.actions}: ${node.name || node.id}`}
                    variant="ghost"
                    size="sm"
                    items={[{label: t.addNodeToGroup, isDisabled: !addToGroup, onClick: () => addToGroup?.(node)}]}
                  />
                }
                label={<LoadingText weight="medium" textWrap="wrap" loading={loading} children={node.name || node.id} />}
                description={<LoadingText type="supporting" color="secondary" loading={loading} children={node.protocol} />}
              />
            ))}
          </List>
        </RowEntrance>
      </CollectionLoading>
      {pager}
      {nodes && !filtered.length && (
        <EmptyState
          title={search ? t.noMatches : t.subscriptionEmpty}
          actions={!search && edit ? <Button label={t.editSubscriptionLink} variant="secondary" onClick={edit} /> : undefined}
        />
      )}
    </VStack>
  );
}
