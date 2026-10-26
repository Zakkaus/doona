import {Selector} from '@astryxdesign/core/Selector';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {useState} from 'react';
import {groupNameProblem, readGroupEntries, writeGroupEntry} from '../../../src/dae/groups';
import {EMPTY_GROUP_FILTER} from './groupBindings';
import {useMessages} from './i18n';
import {EditDialog} from './ui/EditDialog';
import {policyLabel} from './ui/groupLabels';

// Creating a group is the page's one creation dialog; members are chosen afterwards in the 编排 inspector.
export function GroupEditor({
  content,
  others,
  taken,
  writable,
  close,
  stage
}: {
  content: string;
  others: string[];
  taken: string[];
  writable: boolean;
  close: () => void;
  stage: (content: string, name: string) => void;
}) {
  const t = useMessages();
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [policy, setPolicy] = useState('select');
  const names = new Set([...taken, ...[content, ...others].flatMap(readGroupEntries).map(entry => entry.name)]);
  const problem = name.trim() ? groupNameProblem(name.trim(), names) : null;
  return (
    <EditDialog
      open
      width={560}
      title={t.createGroup}
      close={close}
      pending={false}
      label={t.create}
      disabled={!writable || !name.trim() || problem !== null}
      disabledReason={!writable ? t.readOnly : !name.trim() ? t.enterName : !touched ? t.completeDialog : problem === 'taken' ? t.nameTaken : t.invalidField}
      confirm={() => {
        const next = name.trim();
        stage(writeGroupEntry(content, next, {filters: [EMPTY_GROUP_FILTER], policy: policy === 'select' ? null : policy}), next);
        close();
      }}
    >
      <Text type="supporting" color="secondary">
        {t.createGroupHelp}
      </Text>
      <TextInput
        label={t.name}
        value={name}
        onChange={setName}
        isDisabled={!writable}
        onBlur={() => setTouched(true)}
        status={touched && problem ? {type: 'error', message: problem === 'taken' ? t.nameTaken : t.invalidField} : undefined}
      />
      <Selector
        label={t.policy}
        value={policy}
        options={['select', 'urltest', 'roundrobin', 'fallback', 'score'].map(value => ({
          value,
          label: policyLabel(value, t)
        }))}
        onChange={value => setPolicy(value ?? 'select')}
        isDisabled={!writable}
      />
    </EditDialog>
  );
}
