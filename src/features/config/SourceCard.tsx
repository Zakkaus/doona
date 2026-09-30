import {useT} from '../../i18n';
import {Badge, Button, Card, Light, type Action} from '../../ui/ui';
import {CodeEditor} from '../../ui/code/CodeEditor';
import {ChangedOnDisk} from './ChangedOnDisk';
import {useSourceCard, type SourceCardProps} from './useConfigPage';
export function SourceCard(props: SourceCardProps) {
  const {canValidate} = props;
  const t = useT();
  const {
    writable,
    note,
    refused,
    shown,
    marks,
    text,
    outbounds,
    focus,
    dirty,
    conflict,
    keep,
    validate,
    save,
    cancel,
    change,
    view,
    busy,
    validating,
    saving,
    saveButton,
    validateDisabled,
    reason
  } = useSourceCard(props);
  const actions: Action[] = [
    ...(canValidate
      ? [
          {
            id: 'validate',
            label: t('config.validate'),
            isPending: validating,
            isDisabled: validateDisabled,
            reason: reason ?? undefined,
            onAction: () => void validate()
          }
        ]
      : []),
    ...(dirty
      ? [
          {id: 'cancel', label: t('ui.cancel'), isDisabled: busy, onAction: cancel},
          {
            id: 'save',
            label: t('config.save'),
            accent: true,
            isPending: saving,
            isDisabled: saveButton.disabled,
            reason: saveButton.tip ?? reason ?? undefined,
            onAction: () => void save()
          }
        ]
      : [])
  ];
  return (
    <Card
      title={t('config.editor')}
      aria-label={view.label}
      help={writable ? {title: t('config.editor'), text: t('config.writeHelp')} : undefined}
      reason={reason}
    >
      <div className="rp-row rp-source-note">
        <span className="rp-cluster">
          {dirty ? (
            <>
              <Badge tone="warn">{t('config.unsaved')}</Badge>
              <span className="rp-label">{t('config.unsavedHint')}</span>
            </>
          ) : (
            <span className="rp-label">{note}</span>
          )}
        </span>
      </div>
      {conflict && <ChangedOnDisk message={conflict} busy={busy} keep={keep} />}
      {shown.length > 0 && (
        <div className="rp-list rp-config-diagnostics" role="list" aria-label={t('config.diagnostics')}>
          {shown.map(item => (
            <div className="rp-cluster" role="listitem" key={item.id}>
              <Light small tone={item.tone}>
                {item.detail}
              </Light>
              <Button small quiet label={t('config.openSourceAt', {where: item.where})} onPress={() => props.open(item.sourceId, item.line)}>
                {t('config.openSource')}
              </Button>
            </div>
          ))}
        </div>
      )}
      <CodeEditor
        actions={actions}
        label={view.label}
        value={text}
        readOnly={!writable || busy}
        onChange={change}
        onReadOnlyAttempt={refused}
        marks={marks}
        focusLine={focus}
        outbounds={outbounds}
        onSave={dirty && !busy ? () => void save() : undefined}
      />
    </Card>
  );
}
