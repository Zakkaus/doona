import {useT} from '../../i18n';
import {DaeCode} from '../../ui/DaeCode';
import {
  Badge,
  Button,
  Card,
  ContextualHelp,
  DataTable,
  ErrorMessage,
  InlineAlert,
  Kv,
  LabeledSelect,
  Light,
  Link,
  Loading,
  ModalDialog,
  Segmented,
  Tabs,
  TextField,
  TextTooltip,
  Empty
} from '../../ui/ui';
import Download from '../../ui/icons/Download';
import AddCircle from '../../ui/icons/AddCircle';
import Refresh from '../../ui/icons/Refresh';
import {CodeEditor} from '../../ui/code/CodeEditor';
import {Wizard} from './Wizard';
import type {PageProps} from '../../shell/routes';
import {useConfigPage, useSourceCard, useValidateTab, type SourceCardProps, type ValidateTabProps} from './useConfigPage';
import {useModules, type ModulesProps} from './useModules';
import {useNewSource, type NewSourceProps} from './useNewSource';
export function Config(props: PageProps) {
  const t = useT();
  const {
    error,
    reload,
    loading,
    ready,
    metadata,
    redacted,
    tabs,
    tab,
    setTab,
    selectedId,
    select,
    sourceProps,
    newSourceProps,
    wizardProps,
    validateProps,
    modulesProps,
    sourceModel,
    sourceOptions,
    exportSource,
    summaryTone,
    summaryText
  } = useConfigPage(props);
  const content = {
    modules: modulesProps && <Modules {...modulesProps} />,
    setup: wizardProps && <Wizard {...wizardProps} />,
    source: (
      <>
        <div className="rp-toolbar">
          <span className="rp-cluster nowrap rp-source-pick">
            <LabeledSelect side cut="start" label={t('config.source')} value={selectedId} onChange={select} items={sourceOptions} />
            {sourceModel && (
              <>
                {sourceModel.readOnly && (
                  <span className="rp-help-row">
                    <Badge>{sourceModel.readOnly.label}</Badge>
                    {sourceModel.readOnly.help && <ContextualHelp {...sourceModel.readOnly.help} />}
                  </span>
                )}
                <TextTooltip className="rp-label" text={sourceModel.loaded}>
                  {sourceModel.facts}
                </TextTooltip>
              </>
            )}
          </span>
          {(newSourceProps || sourceModel?.hasContent) && (
            <span className="rp-cluster nowrap">
              {newSourceProps && <NewSource {...newSourceProps} />}
              {sourceModel?.hasContent && (
                <Button onPress={exportSource}>
                  <Download />
                  {t('config.export')}
                </Button>
              )}
            </span>
          )}
        </div>
        {sourceModel?.hasContent && <span className="rp-label">{t('config.exportWarning')}</span>}
        {sourceProps && <SourceCard key={sourceModel!.id} {...sourceProps} />}
      </>
    ),
    validate: validateProps && <ValidateTab {...validateProps} />
  };
  return (
    <div className="rp-page">
      <ErrorMessage error={error} onRetry={reload} />
      {loading && <Loading />}
      {ready && (
        <div className="rp-toolbar">
          <Kv row items={metadata} />
          <Light small tone={summaryTone}>
            {summaryText}
          </Light>
          {redacted && (
            <Light small tone="muted">
              {t('config.redacted')}
            </Light>
          )}
        </div>
      )}
      {ready && <Tabs label={t('nav.config')} value={tab} onChange={setTab} items={tabs.map(item => ({...item, content: content[item.id]}))} />}
    </div>
  );
}

function NewSource(props: NewSourceProps) {
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

function Modules(props: ModulesProps) {
  const t = useT();
  const vm = useModules(props);
  return (
    <div className="rp-page">
      {vm.cards.map(card => (
        <Card key={card.id} aria-label={card.kind}>
          <div className="rp-row">
            <span className="rp-cluster">
              <h3 className="rp-h3 rp-code">{card.kind}</h3>
              <span className="rp-label rp-code">{card.range}</span>
              {card.editing && vm.dirty && <Badge tone="warn">{t('config.unsaved')}</Badge>}
            </span>
            <span className="rp-cluster">
              {card.href && (
                <Link appearance="button" href={card.href}>
                  {t('config.moduleOpen')}
                </Link>
              )}
              {card.canEdit && !card.editing && (
                <Button isDisabled={card.editDisabled} tip={card.editTip} onPress={card.edit}>
                  {t('config.edit')}
                </Button>
              )}
              {card.manual && !card.editing && (
                <Button quiet tip={t('config.moduleManualTip')} onPress={card.manual}>
                  {t('config.moduleManual')}
                </Button>
              )}
            </span>
          </div>
          <Light small tone={card.muted ? 'muted' : 'info'}>
            {card.summary}
          </Light>
          {card.note && (
            <Light small tone="muted">
              {card.note}
            </Light>
          )}
          {card.editing && (
            <>
              <CodeEditor
                label={card.range}
                value={vm.text}
                onChange={vm.change}
                readOnly={vm.busy}
                marks={vm.marks}
                outbounds={vm.outbounds}
                onSave={vm.dirty && !vm.busy ? () => void vm.save() : undefined}
              />
              {vm.conflict && (
                <InlineAlert
                  action={
                    vm.keep && (
                      <Button isDisabled={vm.busy} onPress={vm.keep}>
                        {t('config.keepChanges')}
                      </Button>
                    )
                  }
                >
                  {vm.conflict}
                </InlineAlert>
              )}
              {vm.diagnostics.length > 0 && (
                <div className="rp-list rp-config-diagnostics" role="list" aria-label={t('config.diagnostics')}>
                  {vm.diagnostics.map(item => (
                    <div key={item.id} role="listitem">
                      <Light small tone={item.tone}>
                        {item.detail}
                      </Light>
                    </div>
                  ))}
                </div>
              )}
              <div className="rp-cluster">
                {vm.canValidate && (
                  <Button isPending={vm.validating} isDisabled={vm.busy} onPress={() => void vm.validate()}>
                    {t('config.validate')}
                  </Button>
                )}
                <Button accent isPending={vm.saving} isDisabled={vm.busy || !vm.dirty || !!vm.conflict} onPress={() => void vm.save()}>
                  {t('config.save')}
                </Button>
                <Button isDisabled={vm.busy} onPress={vm.cancel}>
                  {t('ui.cancel')}
                </Button>
              </div>
            </>
          )}
        </Card>
      ))}
    </div>
  );
}

function SourceCard(props: SourceCardProps) {
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
      {conflict && (
        <InlineAlert
          action={
            <Button isDisabled={busy} onPress={keep}>
              {t('config.keepChanges')}
            </Button>
          }
        >
          {conflict}
        </InlineAlert>
      )}
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

function ValidateTab(props: ValidateTabProps) {
  const {canValidate, open} = props;
  const t = useT();
  const {level, setLevel, selected, setSelected, shown, validate, summaryTone, summary, lastRun, validating, blocked, tip, levels} = useValidateTab(props);
  return (
    <>
      <div className="rp-toolbar">
        <Light small tone={summaryTone}>
          {summary}
        </Light>
        <span className="rp-label">{lastRun}</span>
        <span className="rp-grow" />
        {canValidate && (
          <Button isPending={validating} isDisabled={blocked} tip={tip} onPress={validate}>
            <Refresh className="rp-spin-on-press" />
            {t('config.revalidate')}
          </Button>
        )}
      </div>
      <span className="rp-label">{t('config.validateNote')}</span>
      <Segmented label={t('config.level')} value={level} onChange={setLevel} items={levels} />
      <DataTable
        label={t('config.diagnostics')}
        rows={shown}
        height={360}
        selected={selected}
        onSelect={setSelected}
        detail={cur => (
          <div className="rp-cluster rp-config-diagnostics">
            <Light small tone={cur.tone}>
              {cur.detail}
            </Light>
            <Button label={t('config.openSourceAt', {where: cur.where})} onPress={() => open(cur.sourceId, cur.line)}>
              {t('config.openSource')}
            </Button>
          </div>
        )}
        empty={t('config.noDiagnostics')}
        cols={[
          {
            id: 'level',
            label: t('config.level'),
            minWidth: 96,
            grow: 0,
            render: item => (
              <Light small tone={item.tone}>
                {item.levelText}
              </Light>
            )
          },
          {
            id: 'where',
            label: t('config.where'),
            minWidth: 150,
            grow: 0,
            render: item => <span className="rp-code">{item.where}</span>
          },
          {id: 'message', label: t('config.message'), minWidth: 240, grow: 2, isRowHeader: true, render: item => <TextTooltip>{item.message}</TextTooltip>},
          {id: 'code', label: t('config.code'), minWidth: 140, drop: 1, render: item => <DaeCode text={item.code} />}
        ]}
      />
    </>
  );
}
