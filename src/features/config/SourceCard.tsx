import {useT} from '../../i18n';
import {Badge, Button, Card, Empty, Light} from '../../ui/ui';
import {CodeEditor} from '../../ui/code/CodeEditor';
import {ChangedOnDisk} from './ChangedOnDisk';
import {useSourceCard, type SourceCardProps} from './useConfigPage';
export function SourceCard(props: SourceCardProps) {
  const {canValidate, contentOffered} = props;
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
    validateTip
  } = useSourceCard(props);
  return (
    <Card aria-label={view.label}>
      <div className="rp-row rp-source-note">
        <span className="rp-cluster">
          {dirty ? (
            <>
              <Badge tone="warn">{t('config.unsaved')}</Badge>
              <span className="rp-label">{t('config.unsavedHint')}</span>
            </>
          ) : (
            view.hasContent && <span className="rp-label">{note}</span>
          )}
        </span>
        {(canValidate || dirty) && (
          <span className="rp-cluster nowrap">
            {canValidate && (
              <Button isPending={validating} isDisabled={validateDisabled} tip={validateTip} onPress={() => void validate()}>
                {t('config.validate')}
              </Button>
            )}
            {dirty && (
              <>
                <Button isDisabled={busy} onPress={cancel}>
                  {t('ui.cancel')}
                </Button>
                <Button accent isPending={saving} isDisabled={saveButton.disabled} tip={saveButton.tip} onPress={() => void save()}>
                  {t('config.save')}
                </Button>
              </>
            )}
          </span>
        )}
      </div>
      {conflict && <ChangedOnDisk message={conflict} busy={busy} keep={keep} />}
      {shown.length > 0 && (
        <div className="rp-list rp-config-diagnostics" role="list" aria-label={t('config.diagnostics')}>
          {shown.map((item, index) => (
            <div className="rp-cluster" role="listitem" key={index}>
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
      {!view.hasContent ? (
        <Empty>{t(contentOffered ? 'config.contentWithheld' : 'config.contentHidden')}</Empty>
      ) : (
        <CodeEditor
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
      )}
    </Card>
  );
}
