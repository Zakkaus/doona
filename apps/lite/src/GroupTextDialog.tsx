import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {TextArea} from '@astryxdesign/core/TextArea';
import {VStack} from '@astryxdesign/core/Stack';
import {useState} from 'react';
import {changeGroupText, groupDraftEntry} from './groupDraft';
import {useMessages} from './i18n';
import {EditDialog} from './ui/EditDialog';

export function GroupTextDialog({
  content,
  others,
  original,
  duplicate,
  stage,
  close
}: {
  content: string;
  others: string[];
  original: string;
  duplicate: boolean;
  stage: (content: string) => void;
  close: () => void;
}) {
  const t = useMessages();
  const entry = groupDraftEntry(content, original);
  const initial = entry ? content.slice(entry.open + 1, entry.close) : '';
  const [name, setName] = useState(duplicate ? `${original}-copy` : original);
  const [body, setBody] = useState(initial);
  const [error, setError] = useState<unknown>();
  return (
    <EditDialog
      open
      title={`${duplicate ? t.duplicate : t.editAsText}: ${original}`}
      close={close}
      pending={false}
      label={t.save}
      disabled={!entry || !name.trim()}
      notice={error ? {error} : undefined}
      disabledReason={!entry ? t.readOnly : t.enterName}
      reset={
        !duplicate
          ? () => {
              setName(duplicate ? `${original}-copy` : original);
              setBody(initial);
              setError(undefined);
            }
          : undefined
      }
      confirm={() => {
        try {
          stage(changeGroupText(content, others, original, name, body, duplicate));
          close();
        } catch (error) {
          setError(error);
        }
      }}
    >
      <Text type="supporting" color="secondary">
        {t.resourceDraftHelp}
      </Text>
      <TextInput label={t.name} value={name} onChange={setName} isReadOnly={!duplicate} />
      <VStack data-code-editor data-text-mode>
        <TextArea label={t.group} value={body} onChange={setBody} rows={8} width="100%" hasSpellCheck={false} />
      </VStack>
    </EditDialog>
  );
}
