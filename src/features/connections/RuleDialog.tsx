import {useT} from '../../i18n';
import {DaeCode} from '../../ui/DaeCode';
import {ConfirmDialog, ErrorMessage, LabeledSelect, Segmented} from '../../ui/ui';
import type {useConnectionRule} from './useConnectionRule';

export function RuleDialog({dialog}: {dialog: ReturnType<typeof useConnectionRule>['dialog']}) {
  const t = useT();
  return (
    <ConfirmDialog
      title={t('rule.add')}
      isOpen={!!dialog}
      onCancel={() => dialog?.close()}
      tone="accent"
      confirmLabel={t('rule.add')}
      isDisabled={dialog?.disabled}
      isPending={dialog?.busy}
      error={dialog?.failure}
      onConfirm={() => dialog?.submit()}
    >
      {dialog && (
        <div className="rp-list">
          {dialog.failure?.lines.map((line, i) => (
            <span key={i} className="rp-label">
              {line}
            </span>
          ))}
          <ErrorMessage error={dialog.loadError} onRetry={dialog.retry} />
          <span className="rp-label">{t('rule.addHelp')}</span>
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
          {dialog.unplaceable && <p className="rp-note">{t('config.incomplete')}</p>}
          <DaeCode text={dialog.preview} />
        </div>
      )}
    </ConfirmDialog>
  );
}
