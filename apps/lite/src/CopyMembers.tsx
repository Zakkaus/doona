import {Selector} from '@astryxdesign/core/Selector';
import {Text} from '@astryxdesign/core/Text';
import {useState} from 'react';
import type {ConfigSource} from '../../../src/api/model';
import {readGroupEntries, writeGroupEntry} from '../../../src/dae/groups';
import {useMessages} from './i18n';
import {describeGroupChanges, phraseText} from './describe';
import {groupChanges} from './groupDraft';
import {ReviewBody} from './ui/ReviewDialog';
import {EditDialog} from './ui/EditDialog';
export default function CopyMembers({
  source: currentSource,
  name,
  draft,
  stage,
  close
}: {
  source: ConfigSource;
  name: string;
  draft?: {source: ConfigSource; content: string};
  stage: (source: ConfigSource, content: string, target: string) => void;
  close: () => void;
}) {
  const t = useMessages();
  const current = draft ? {...currentSource, content: draft.content} : currentSource;
  const [target, setTarget] = useState('');
  const entries = readGroupEntries(current.content);
  const source = entries.find(item => item.name === name);
  const destination = entries.find(item => item.name === target);
  const after = source && destination ? writeGroupEntry(current.content, target, {filters: source.filters, policy: destination.policy}) : null;
  return (
    <EditDialog
      open
      title={t.copyMembers}
      close={close}
      pending={false}
      label={t.save}
      disabled={!after || !current.writable}
      confirm={() => {
        if (after) {
          stage(draft?.source ?? currentSource, after, target);
          close();
        }
      }}
    >
      <Text>{t.copyMembersHelp}</Text>
      <Selector
        label={t.targetGroup}
        value={target}
        onChange={setTarget}
        options={entries.filter(item => item.name !== name).map(item => ({value: item.name, label: item.name}))}
      />
      {after && (
        <ReviewBody
          summary={describeGroupChanges(groupChanges(current.content, after)).map(item => phraseText(item, t))}
          before={current.content}
          after={after}
        />
      )}
    </EditDialog>
  );
}
