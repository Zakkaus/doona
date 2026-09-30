import {ChoiceMenu, ItemLabel} from '../../ui/ui';
import {useT} from '../../i18n';
import type {ActivityGroupMenu} from './view';

type Model = ActivityGroupMenu & {setChosen: (id: string) => void};

export function GroupMenu({model: vm, label}: {model: Model; label: string}) {
  const t = useT();
  return (
    <ChoiceMenu
      appearance="select"
      placement="bottom start"
      label={label}
      description={t('act.groupPickHelp')}
      searchLabel={t('policy.pickGroups')}
      items={[{id: '', label: t('act.groupFollow')}, ...vm.options.map(group => ({id: group.id, label: group.label, desc: group.description}))]}
      value={vm.chosen}
      onChange={vm.setChosen}
      onAction={vm.setChosen}
    >
      <ItemLabel i={{id: vm.chosen, label: vm.groupName}} />
    </ChoiceMenu>
  );
}
