import {useT} from '../../i18n';
import {DaeCode} from '../../ui/DaeCode';
import {Button, ErrorMessage, InlineAlert, LabeledSelect, Link, ModalDialog, StaticField, Switch} from '../../ui/ui';
import type {QuickRuleDialog} from './useQuickRule';

export function RuleDialog({dialog}: {dialog: QuickRuleDialog}) {
  const t = useT();
  return (
    <ModalDialog
      title={t('rule.add')}
      narrow
      isOpen={!!dialog}
      reason={dialog?.reason}
      onOpenChange={open => {
        if (!open) dialog?.close();
      }}
      footer={() => (
        <>
          <Button onPress={() => dialog?.close()}>{t('ui.cancel')}</Button>
          {dialog?.copyable && <Button onPress={dialog.copy}>{t('rule.copy')}</Button>}
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
          {dialog.lists && <LabeledSelect isDisabled={dialog.busy} label={t('rule.list')} value={dialog.list} onChange={dialog.setList} items={dialog.lists} />}
          {dialog.targets && (
            <LabeledSelect isDisabled={dialog.busy} label={t('rule.kind')} value={dialog.target} onChange={dialog.setTarget} items={dialog.targets} />
          )}
          {dialog.type && (
            <Switch isSelected={dialog.typed} isDisabled={dialog.busy} onChange={dialog.setTyped}>
              {dialog.type}
            </Switch>
          )}
          <div className="rp-toolbar top">
            <LabeledSelect isDisabled={dialog.busy} label={dialog.targetLabel} value={dialog.outbound} onChange={dialog.setOutbound} items={dialog.outbounds} />
            {!dialog.writable ? null : dialog.positions.length === 1 ? (
              <StaticField label={t('rule.position')} value={dialog.positions[0].label} description={dialog.positions[0].desc} />
            ) : (
              <LabeledSelect
                isDisabled={dialog.busy || !dialog.positions.length}
                label={t('rule.position')}
                value={dialog.before}
                onChange={dialog.setBefore}
                items={dialog.positions}
              />
            )}
          </div>
          {dialog.moved && <InlineAlert tone="informative">{t('conn.ruleMoved')}</InlineAlert>}
          {dialog.earlier && !dialog.moved && <p className="rp-note">{t('rule.earlierMayMatch')}</p>}
          {dialog.unplaceable &&
            (dialog.configHref ? (
              <p className="rp-note">
                {t('rule.dns.noPlace')}{' '}
                <Link appearance="link" external href={dialog.configHref}>
                  {t('dns.openConfig')}
                </Link>
              </p>
            ) : (
              <p className="rp-note">{t('conn.ruleNoPosition')}</p>
            ))}
          {dialog.duplicate && <p className="rp-note">{dialog.duplicate}</p>}
          <DaeCode text={dialog.preview} />
        </div>
      )}
    </ModalDialog>
  );
}
