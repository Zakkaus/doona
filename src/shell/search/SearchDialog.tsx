import {ListBox, ListBoxItem, ListBoxSection, Header} from 'react-aria-components';
import {useT} from '../../i18n';
import {Button, ModalDialog, TextField, ErrorMessage, Loading, Empty} from '../../ui/ui';
import Close from '../../ui/icons/Close';
import type {PageProps} from '../../features/types';
import {useSearch} from './useSearch';

export function SearchDialog({onClose, go}: {onClose: () => void; go: PageProps['go']}) {
  const t = useT();
  const {q, setQ, sections, empty, error, loading, select} = useSearch(go, onClose);
  return (
    <ModalDialog
      title={t('search')}
      hideTitle
      isOpen
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <div className="rp-toolbar">
        {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves into the dialog the user just opened */}
        <TextField search large label={t('search')} value={q} onChange={setQ} autoFocus className="rp-grow" />
        <Button quiet icon onPress={onClose} label={t('close')}>
          <Close />
        </Button>
      </div>
      {error && <ErrorMessage error={error} />}
      {empty && (loading ? <Loading /> : <Empty>{t('search.none')}</Empty>)}
      <ListBox aria-label={t('search')} className="rp-results" onAction={select}>
        {sections.map(section => (
          <ListBoxSection key={section.id} id={section.id}>
            <Header className="rp-section-h">{section.title}</Header>
            {section.items.map(item => (
              <ListBoxItem key={item.id} id={item.id} className="rp-item plain" textValue={item.label}>
                <span>{item.label}</span>
                {item.description && <span className="desc">{item.description}</span>}
              </ListBoxItem>
            ))}
          </ListBoxSection>
        ))}
      </ListBox>
    </ModalDialog>
  );
}
