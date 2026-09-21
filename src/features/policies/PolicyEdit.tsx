import {useState} from 'react';
import {useT} from '../../i18n';
import {policyKindLabels} from './view';
import {canonicalPolicy, policyNames, writeGroupEntry, type GroupEntry} from '../config/groups';
import type {MainSourceEdit} from '../config/mainSource';
import type {ConfigSource} from '../../api/model';
import Close from '../../ui/icons/Close';
import {Button, LabeledSelect, ModalDialog, TextField, errorText, toast} from '../../ui/ui';

export function PolicyEdit({name, source, entry}: {name: string; source: MainSourceEdit; entry: GroupEntry | undefined}) {
  const t = useT();
  const [draft, setDraft] = useState<{name: string; origin: ConfigSource; policy: string | null; filters: string[]} | null>(null);
  const saveDraft = (close: () => void) => {
    if (!draft) return;
    const filters = draft.filters.map(f => f.trim()).filter(Boolean);
    void source
      .apply(
        text => writeGroupEntry(text, draft.name, {filters, policy: draft.policy}),
        errors => toast('negative', t('policy.editInvalid', {n: errors})),
        draft.origin
      )
      .then(
        written => {
          if (written) {
            toast('positive', t('policy.updated', {name: draft.name}));
            close();
          }
        },
        error => toast('negative', errorText(error))
      );
  };
  return (
    <ModalDialog
      title={t('policy.editTitle', {name})}
      narrow
      isOpen={draft !== null}
      onOpenChange={isOpen => {
        if (!isOpen) setDraft(null);
      }}
      trigger={
        draft || (source.writable && entry && source.main) ? (
          <Button
            quiet
            isDisabled={source.busy || !entry || !source.main}
            onPress={() => {
              if (entry && source.main) setDraft({name: entry.name, origin: source.main, policy: entry.policy, filters: entry.filters});
            }}
          >
            {t('policy.edit')}
          </Button>
        ) : undefined
      }
      footer={close => (
        <>
          <Button onPress={close}>{t('ui.cancel')}</Button>
          <Button accent isDisabled={!draft} isPending={source.busy} onPress={() => saveDraft(close)}>
            {t('policy.save')}
          </Button>
        </>
      )}
    >
      {draft && (
        <div className="rp-list">
          <span className="rp-label">{t('policy.editHelp')}</span>
          <LabeledSelect
            label={t('policy.policy')}
            value={canonicalPolicy(draft.policy)}
            onChange={policy => setDraft({...draft, policy})}
            items={policyNames.map(name => ({id: name, label: t(policyKindLabels[name]), desc: name}))}
          />
          {draft.filters.map((filter, i) => (
            <TextField
              key={i}
              label={t('policy.filterN', {n: i + 1})}
              value={filter}
              placeholder="name(keyword: 'HK')"
              spellCheck={false}
              onChange={value => setDraft({...draft, filters: draft.filters.map((f, j) => (j === i ? value : f))})}
              action={
                <Button
                  quiet
                  icon
                  label={t('policy.removeFilter', {n: i + 1})}
                  onPress={() => setDraft({...draft, filters: draft.filters.filter((_, j) => j !== i)})}
                >
                  <Close />
                </Button>
              }
            />
          ))}
          <Button small quiet onPress={() => setDraft({...draft, filters: [...draft.filters, '']})}>
            {t('policy.addFilter')}
          </Button>
        </div>
      )}
    </ModalDialog>
  );
}
