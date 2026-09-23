import {useT} from '../../i18n';
import {LabeledSelect} from '../../ui/ui';
import {policyChoices} from './policyText';

// How a group chooses among its members; every group editor offers the same choices.
export function PolicyPicker({value, onChange, isDisabled}: {value: string | null; onChange: (policy: string) => void; isDisabled?: boolean}) {
  const t = useT();
  const {selected, items} = policyChoices(value, t);
  return <LabeledSelect label={t('arrange.policy')} value={selected} onChange={onChange} items={items} isDisabled={isDisabled} />;
}
