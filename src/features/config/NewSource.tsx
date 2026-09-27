import {useT} from '../../i18n';
import {Button, InlineAlert, LabeledSelect, ModalDialog, TextField} from '../../ui/ui';
import AddCircle from '../../ui/icons/AddCircle';
import {useNewSource, type NewSourceProps} from './useNewSource';
export function NewSource(props: NewSourceProps) {
  const t = useT();
  const vm = useNewSource(props);
  return (
    <>
      <Button onPress={vm.show}>
        <AddCircle />
        {t('config.newSource')}
      </Button>
      <ModalDialog
        title={t('config.newSourceTitle')}
        narrow
        isOpen={vm.isOpen}
        onOpenChange={isOpen => {
          if (!isOpen) vm.hide();
        }}
        footer={close => (
          <>
            <Button onPress={close}>{t('ui.cancel')}</Button>
            <Button accent isDisabled={!vm.canSubmit} isPending={vm.busy} onPress={() => void vm.submit(close)}>
              {t('config.newSourceCreate')}
            </Button>
          </>
        )}
      >
        {vm.problem && (
          <InlineAlert key={vm.problem.id} takeFocus>
            {vm.problem.text}
          </InlineAlert>
        )}
        <div className="rp-list">
          <span className="rp-label">{t(vm.choice ? 'config.newSourceNameHelp' : 'config.newSourceHelp')}</span>
          {vm.choices.length > 1 && (
            <LabeledSelect
              label={t('config.newSourcePattern')}
              items={vm.choices.map(item => ({id: item.pattern, label: item.pattern}))}
              value={vm.choice?.pattern ?? ''}
              onChange={vm.setChoice}
              isDisabled={vm.busy}
            />
          )}
          {vm.choice ? (
            <TextField
              isDisabled={vm.busy}
              label={t('config.newSourceName')}
              value={vm.text}
              prefix={vm.choice.prefix}
              suffix={vm.choice.suffix}
              placeholder="extra"
              spellCheck={false}
              error={vm.error}
              onChange={vm.setText}
            />
          ) : (
            <TextField
              isDisabled={vm.busy}
              label={t('config.newSourcePath')}
              value={vm.text}
              placeholder="config.d/extra.dae"
              spellCheck={false}
              error={vm.error}
              onChange={vm.setText}
            />
          )}
          {vm.unmatched && <InlineAlert tone="informative">{t('config.newSourceUnmatched')}</InlineAlert>}
        </div>
      </ModalDialog>
    </>
  );
}
