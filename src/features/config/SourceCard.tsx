import {useEffect, useRef, useState} from 'react';
import {useT} from '../../i18n';
import {Badge, Button, Card, Disclosure, Light, Link, Segmented, type Action} from '../../ui/ui';
import {CodeEditor} from '../../ui/code/CodeEditor';
import {ChangedOnDisk} from './ChangedOnDisk';
import {useSourceCard, type SourceCardProps} from './useConfigPage';
import {locatedForms} from './sourceForms';
export function SourceCard(props: SourceCardProps) {
  const {canValidate} = props;
  const t = useT();
  const {
    writable,
    links,
    acceptChange,
    checkedDraft,
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
  const panel = useRef<HTMLElement>(null);
  const [level, setLevel] = useState('all');
  useEffect(() => {
    if (props.focusDiagnostics) {
      panel.current?.focus();
      panel.current?.scrollIntoView({block: 'nearest'});
    }
  }, [props.focusDiagnostics, props.focusLine, props.source.id]);
  const located = locatedForms(links, focus, text);
  const jumps = located.length ? located : links;
  const formLinks = (
    <div className="rp-toolbar" aria-label={t('config.forms')}>
      {jumps.map(link => (
        <Link key={link.from} appearance="button" href={link.href}>
          {link.label}
        </Link>
      ))}
    </div>
  );
  const filtered = shown.filter(item => level === 'all' || item.level === level);
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
    <div className="rp-config-workspace">
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
        <p className="rp-label">{t('config.formOwned')}</p>
        {located.length ? formLinks : links.length > 0 && <Disclosure title={t('config.forms')}>{formLinks}</Disclosure>}
        <CodeEditor
          actions={actions}
          label={view.label}
          value={text}
          readOnly={!writable || busy}
          onChange={change}
          acceptChange={acceptChange}
          onReadOnlyAttempt={refused}
          marks={marks}
          focusLine={focus}
          outbounds={outbounds}
          onSave={dirty && !busy ? () => void save() : undefined}
        />
      </Card>
      <Card ref={panel} tabIndex={-1} className="rp-config-diagnostics" title={t('config.diagnostics')}>
        <span className="rp-label">
          {dirty
            ? t(checkedDraft ? 'config.draftDiagnostics' : 'config.draftPending')
            : checkedDraft
              ? t('config.fileDiagnostics')
              : t('config.acceptedDiagnostics', {generation: props.generation})}
        </span>
        <Segmented
          label={t('config.level')}
          value={level}
          onChange={setLevel}
          items={[
            ['all', t('config.levelAll', {n: shown.reduce((sum, item) => sum + item.count, 0)})],
            ['error', t('config.levelErrors', {n: shown.filter(item => item.level === 'error').reduce((sum, item) => sum + item.count, 0)})],
            ['warning', t('config.levelWarnings', {n: shown.filter(item => item.level === 'warning').reduce((sum, item) => sum + item.count, 0)})],
            ['info', t('config.levelInfo', {n: shown.filter(item => item.level === 'info').reduce((sum, item) => sum + item.count, 0)})]
          ]}
        />
        <div className="rp-list" role="list" aria-label={t('config.diagnostics')}>
          {filtered.map(item => (
            <div className="rp-col" role="listitem" key={item.id}>
              <Light small tone={item.tone}>
                {item.detail}
              </Light>
              <Button small onPress={() => props.open(item.sourceId, item.line)}>
                {t('config.openSourceAt', {where: item.where})}
              </Button>
            </div>
          ))}
        </div>
        {!filtered.length && <p className="rp-label">{dirty && !checkedDraft ? t('config.draftPending') : t('config.noDiagnostics')}</p>}
      </Card>
    </div>
  );
}
