import {LayoutFooter, HStack, StackItem, VStack} from '@astryxdesign/core/Layout';
import {Button} from '@astryxdesign/core/Button';
import {Text} from '@astryxdesign/core/Text';
import {useMessages} from '../i18n';
// The page draft footer: how many changes are not in effect yet, and what blocks applying them.
export function DraftBar({
  count,
  discard,
  review,
  pending,
  disabled,
  blocked
}: {
  count: number;
  discard: () => void;
  review: () => void;
  pending: boolean;
  disabled?: boolean;
  blocked?: string | null;
}) {
  const t = useMessages();
  return (
    <LayoutFooter hasDivider padding={4}>
      <HStack gap={2} wrap="wrap" vAlign="center">
        <StackItem size="fill">
          <VStack gap={0.5}>
            <Text role="status">{(count === 1 ? t.unsavedChangesOne : t.unsavedChanges).replace('{n}', String(count))}</Text>
            {blocked && (
              <Text type="supporting" color="secondary" data-draft-blocked>
                {blocked}
              </Text>
            )}
          </VStack>
        </StackItem>
        <Button label={t.discard} variant="secondary" onClick={discard} isDisabled={pending} />
        <Button label={t.reviewChanges} variant="primary" onClick={review} isLoading={pending} isDisabled={disabled} />
      </HStack>
    </LayoutFooter>
  );
}
