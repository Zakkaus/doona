import {useEffect, useRef} from 'react';
import {useT} from '../../i18n';
import {Badge, Button, Card, Disclosure, Light, Link, Toolbar, VisuallyHidden, type Action} from '../../ui/ui';
import {CodeEditor} from '../../ui/code/CodeEditor';
import {ChangedOnDisk} from './ChangedOnDisk';
import {RestartNotice} from './RestartNotice';
import {useSourceCard, type SourceCardProps} from './useConfigPage';
import {locatedForms} from './sourceForms';
export function SourceCard(props: SourceCardProps) {
  const {canValidate} = props;
  const t = useT();
  const {
    writable,
    links,
    diagnostics: d,
    note,
    refused,
    restart,
    marks,
    text,
    outbounds,
    focus,
    focusKey,
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
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (props.focusDiagnostics) {
      panel.current?.focus();
      panel.current?.scrollIntoView({block: 'nearest'});
    }
  }, [props.focusDiagnostics, props.focusLine, props.source.id]);
  const located = locatedForms(links, focus, text);
  const jumps = located.length ? located : links;
  const formLinks = (
    <Toolbar aria-label={t('config.forms')}>
      {jumps.map(link => (
        <Link key={link.from} appearance="button" href={link.href}>
          {link.label}
        </Link>
      ))}
    </Toolbar>
  );
  // Pinned under the editor's toolbar: one bar as wide as the editor, its counts opening into the list on errors.
  const banner = (
    <div ref={panel} tabIndex={-1} role="region" aria-label={t('config.diagnostics')} className="rp-config-diagnostics">
      {d.quiet ? (
        <span className="rp-config-diagnostics-quiet rp-label">{d.quiet}</span>
      ) : (
        <Disclosure
          isExpanded={d.open}
          onExpandedChange={d.setOpen}
          title={
            <span className="rp-config-diagnostics-summary">
              <Badge tone={d.errors ? 'negative' : undefined}>{t('config.levelErrors', {n: d.errors})}</Badge>
              <Badge tone={d.warnings ? 'warn' : undefined}>{t('config.levelWarnings', {n: d.warnings})}</Badge>
              <span className="rp-label">{d.scope}</span>
            </span>
          }
        >
          <div className="rp-config-diagnostic-list" role="list" aria-label={t('config.diagnostics')}>
            {d.rows.map(item => (
              <div className="rp-config-diagnostic" role="listitem" key={item.id}>
                <Light small tone={item.tone}>
                  <VisuallyHidden>{`${item.levelText} `}</VisuallyHidden>
                  {item.text}
                </Light>
                {item.backend && (
                  <Disclosure flush title={t('config.backendText')}>
                    <code>{item.backend}</code>
                  </Disclosure>
                )}
                {item.action && (
                  <Button
                    small
                    className="rp-config-diagnostic-go"
                    label={item.action === 'jump' ? t('config.jumpToLine', {line: item.line!}) : t('config.openSourceAt', {where: item.where})}
                    onPress={() => d.go(item)}
                  >
                    {t(item.action === 'jump' ? 'cm.go' : 'config.openSource')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Disclosure>
      )}
    </div>
  );
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
      className="rp-source-card"
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
      {restart.length > 0 && <RestartNotice settings={restart} sources={props.sources} />}
      {located.length ? formLinks : links.length > 0 && <Disclosure title={t('config.forms')}>{formLinks}</Disclosure>}
      <CodeEditor
        actions={actions}
        label={view.label}
        value={text}
        readOnly={!writable || busy}
        onChange={change}
        onReadOnlyAttempt={refused}
        marks={marks}
        focusLine={focus}
        focusKey={focusKey}
        banner={banner}
        outbounds={outbounds}
        onSave={dirty && !busy ? () => void save() : undefined}
      />
    </Card>
  );
}
