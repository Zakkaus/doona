import {useId} from 'react';
import {useT} from '../../i18n';
import {CheckboxSet} from '../../ui/CheckboxSet';
import {SearchSelect} from '../../ui/SearchSelect';
import {Button, Checkbox, DialogForm, ErrorMessage, InlineAlert, Link, ModalDialog} from '../../ui/ui';
import {BackendText} from '../shared/BackendText';
import type {ServiceRulesModel} from './useServiceRules';

export function ServiceRulesDialog({model: m}: {model: ServiceRulesModel}) {
  const t = useT();
  const form = useId();
  return (
    <ModalDialog
      title={t('rule.service.add')}
      isOpen={m.open}
      onOpenChange={open => !open && m.close()}
      scrollBody
      reason={m.refusal}
      footer={() => (
        <>
          <Button onPress={m.close}>{t('ui.cancel')}</Button>
          <Button isDisabled={m.disabled} isPending={m.busy} onPress={m.applyNow}>
            {t('rule.addApply')}
          </Button>
          <Button accent type="submit" form={form} isDisabled={m.disabled || m.busy}>
            {t('rule.hold')}
          </Button>
        </>
      )}
    >
      <DialogForm
        id={form}
        onSubmit={event => {
          event.preventDefault();
          m.hold();
        }}
      >
        <p className="rp-note">{t('rule.service.help')}</p>
        <span className="rp-label">{t('rule.holdHelp')}</span>
        <ErrorMessage error={m.loadError} onRetry={m.retry} />
        {m.refusal && (
          <InlineAlert
            action={
              <Link appearance="link" href={m.sourceHref}>
                {t('rule.openSource')}
              </Link>
            }
          >
            {m.refusal}
          </InlineAlert>
        )}
        {m.failure && (
          <InlineAlert key={m.failure.id} title={m.failure.text} takeFocus>
            {m.failure.lines.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
            <BackendText texts={m.failure.backend ?? []} />
          </InlineAlert>
        )}
        <SearchSelect
          label={t('rule.service.outbound')}
          searchLabel={t('ui.filterOutbounds')}
          sections={m.sections}
          value={m.outbound}
          onChange={m.setOutbound}
          isDisabled={m.busy}
        />
        {m.services.map(section => (
          <CheckboxSet key={section.id} label={section.label} items={section.items} value={m.selected} onChange={m.setSelected} isDisabled={m.busy} />
        ))}
        {m.steamOption && (
          <Checkbox
            label={t('rule.service.steamCn')}
            description={t('rule.service.steamCnHelp')}
            isSelected={m.steamCn}
            onChange={m.setSteamCn}
            isDisabled={m.busy}
          />
        )}
        {m.dnsNote && <p className="rp-note">{t('rule.service.dnsNote')}</p>}
        {m.dnsSkipped && <InlineAlert tone="informative">{t('rule.service.dnsSkipped')}</InlineAlert>}
      </DialogForm>
    </ModalDialog>
  );
}
