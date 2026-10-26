import {Banner} from '@astryxdesign/core/Banner';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {useState} from 'react';
import {useMessages} from '../i18n';
import type {Notice} from '../state';
import {ConfigDiff} from './ConfigDiff';
import {EditDialog} from './EditDialog';
import {RowEntrance} from './motion';

// The one review step every draft page shares: a plain summary first, the configuration text on request.
export function ReviewBody({summary, before, after, warning}: {summary: string[]; before: string; after: string; warning?: string | null}) {
  const t = useMessages();
  const [showText, setShowText] = useState(false);
  return (
    <VStack gap={4} data-review-body>
      {warning && <Banner status="warning" title={warning} collapsible={false} />}
      <RowEntrance>
        <VStack as="ul" gap={2} aria-label={t.reviewSummary}>
          {summary.map((line, i) => (
            <VStack as="li" key={i} gap={0}>
              <Text style={{overflowWrap: 'anywhere'}}>{line}</Text>
            </VStack>
          ))}
        </VStack>
      </RowEntrance>
      <Collapsible data-config-text chevronPosition="start" isOpen={showText} onOpenChange={setShowText} trigger={<Text type="label">{t.viewConfigText}</Text>}>
        {showText && (
          <VStack gap={0} paddingBlockStart={2} data-config-text>
            <ConfigDiff before={before} after={after} />
          </VStack>
        )}
      </Collapsible>
    </VStack>
  );
}

export function ReviewDialog({
  open,
  close,
  pending,
  notice,
  confirm,
  disabled,
  summary,
  before,
  after,
  warning,
  dialogRef
}: {
  open: boolean;
  close: () => void;
  pending: boolean;
  notice?: Notice;
  confirm: () => void;
  disabled?: boolean;
  summary: string[];
  before: string;
  after: string;
  warning?: string | null;
  dialogRef?: (dialog: HTMLDialogElement | null) => void;
}) {
  const t = useMessages();
  return (
    <EditDialog
      dialogRef={dialogRef}
      open={open}
      title={t.reviewConfig}
      width={560}
      close={close}
      pending={pending}
      label={t.applyConfig}
      notice={notice}
      disabled={disabled || !!warning}
      disabledReason={warning ?? t.readOnly}
      confirm={confirm}
    >
      <ReviewBody summary={summary} before={before} after={after} warning={warning} />
    </EditDialog>
  );
}
