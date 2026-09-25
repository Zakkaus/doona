import {useT} from '../../i18n';
import {DaeCode} from '../../ui/DaeCode';
import {Button, ErrorMessage, InlineAlert, LabeledSelect, ModalDialog, Segmented} from '../../ui/ui';
import type {useConnectionRule} from './useConnectionRule';

export function RuleDialog({dialog}: {dialog: ReturnType<typeof useConnectionRule>['dialog']}) {
  const t = useT();
  return (
    <ModalDialog
      title={t('rule.add')}
      narrow
      isOpen={!!dialog}
      onOpenChange={open => {
        if (!open) dialog?.close();
      }}
      footer={() => (
        <>
          <Button onPress={() => dialog?.close()}>{t('ui.cancel')}</Button>
          <Button isDisabled={dialog?.disabled} isPending={dialog?.busy} onPress={() => dialog?.applyNow()}>
            {t('rule.addApply')}
          </Button>
          <Button accent isDisabled={dialog?.disabled || dialog?.busy} onPress={() => dialog?.hold()}>
            {t('rule.hold')}
          </Button>
        </>
      )}
    >
      {dialog?.failure && (
        <InlineAlert key={dialog.failure.id} takeFocus>
          {dialog.failure.text}
        </InlineAlert>
      )}
      {dialog && (
        <div className="rp-list">
          {dialog.failure?.lines.map((line, i) => (
            <span key={i} className="rp-label">
              {line}
            </span>
          ))}
          <ErrorMessage error={dialog.loadError} onRetry={dialog.retry} />
          <span className="rp-label">{t('rule.holdHelp')}</span>
          {dialog.targets && (
            <Segmented isDisabled={dialog.busy} label={t('rule.kind')} value={dialog.target} onChange={dialog.setTarget} items={dialog.targets} />
          )}
          <div className="rp-toolbar top">
            <LabeledSelect isDisabled={dialog.busy} label={t('ui.outbound')} value={dialog.outbound} onChange={dialog.setOutbound} items={dialog.outbounds} />
            <LabeledSelect
              isDisabled={dialog.busy || !dialog.positions.length}
              label={t('rule.position')}
              value={dialog.before}
              onChange={dialog.setBefore}
              items={dialog.positions}
            />
          </div>
          {dialog.moved && <InlineAlert tone="informative">{t('conn.ruleMoved')}</InlineAlert>}
          {dialog.unplaceable && <p className="rp-note">{t('conn.ruleNoPosition')}</p>}
          <DaeCode text={dialog.preview} />
        </div>
      )}
    </ModalDialog>
  );
}
