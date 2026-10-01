import {useMemo} from 'react';
import {flagChoices, hasEmbeddedFlag} from '../dae/flags';
import {LOCALE, useLang, useT} from '../i18n';
import {Button} from './Button';
import {ModalDialog} from './Dialog';
import {SearchSelect} from './SearchSelect';

type FlagFieldProps = {name: string; value: string; automaticFlag: string | null; onChange: (value: string) => void};
export function FlagField({name, value, automaticFlag, onChange}: FlagFieldProps) {
  const t = useT();
  const lang = useLang();
  const regions = useMemo(() => flagChoices(LOCALE[lang]), [lang]);
  const embedded = hasEmbeddedFlag(name);
  const detected = regions.find(region => region.flag === automaticFlag);
  const detectedLabel = detected ? t('flags.detected', {region: detected.label}) : t('flags.automatic');
  return (
    <div className="rp-list">
      <SearchSelect
        label={t('flags.region')}
        description={t(embedded ? 'flags.embedded' : 'flags.help')}
        isDisabled={embedded}
        searchLabel={t('flags.search')}
        value={embedded ? 'automatic' : value}
        onChange={onChange}
        sections={[
          {
            id: 'flags',
            items: [
              {
                id: 'automatic',
                label: detectedLabel,
                flag: automaticFlag
              },
              {id: 'none', label: t('flags.none'), flag: null},
              ...regions
            ]
          }
        ]}
      />
    </div>
  );
}
export function FlagPicker({name, onClose, ...field}: FlagFieldProps & {name: string; onClose: () => void}) {
  const t = useT();
  return (
    <ModalDialog
      narrow
      title={t('flags.edit')}
      isOpen
      onOpenChange={open => {
        if (!open) onClose();
      }}
      footer={() => <Button onPress={onClose}>{t('ui.close')}</Button>}
    >
      <p className="rp-note">{name}</p>
      <FlagField name={name} {...field} />
    </ModalDialog>
  );
}
