import {Suspense, useEffect, useRef, type ComponentProps} from 'react';
import {useT} from '../../i18n';
import {Badge, Button, Card, Disclosure, Light, Link, PageSkeleton, Segmented, Toolbar, VisuallyHidden, type Action, type PageShape} from '../../ui/ui';
import {preloadable} from '../../ui/preloadable';
import type {CodeEditor} from '../../ui/code/CodeEditor';
import {ChangedOnDisk} from './ChangedOnDisk';
import {RestartNotice} from './RestartNotice';
import {useSourceCard, type SourceCardProps} from './useConfigPage';
import {locatedForms} from './sourceForms';
// CodeMirror loads with the editor, not with the page; the source tab starts it while the file is still being read.
const editor = preloadable<ComponentProps<typeof CodeEditor>>(() => import('../../ui/code/CodeEditor').then(module => ({default: module.CodeEditor})));
export const preloadEditor = () => editor.preload().catch(() => undefined);
// The editor's height follows the file, so its block is a typical file's.
export const editorBlock: PageShape = [{block: 560}];
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
  // The diagnostics sit in the editor's banner, which mounts after the request while the editor is still loading;
  // the focus then waits for the editor's own effects, as it does when the editor is already there.
  const panel = useRef<HTMLDivElement>(null);
  const focusPending = useRef(false);
  const focusPanel = () => {
    if (!focusPending.current || !panel.current) return;
    focusPending.current = false;
    panel.current.focus();
    panel.current.scrollIntoView({block: 'nearest'});
  };
  useEffect(() => {
    focusPending.current = !!props.focusDiagnostics;
    focusPanel();
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
          <div className="rp-config-diagnostic-filter">
            <Segmented label={t('config.level')} value={d.level} onChange={d.setLevel} items={d.levels} />
          </div>
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
      <Suspense fallback={<PageSkeleton panel shape={editorBlock} />}>
        <editor.Component
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
        <AfterMount run={focusPanel} />
      </Suspense>
    </Card>
  );
}

// Runs after the effects of the siblings before it, once they have mounted.
function AfterMount({run}: {run: () => void}) {
  const first = useRef(run);
  useEffect(() => first.current(), []);
  return null;
}
