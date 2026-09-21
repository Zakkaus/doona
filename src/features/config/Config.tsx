import {useT} from '../../i18n';
import {Badge, Button, DataTable, ErrorMessage, Kv, LabeledSelect, Light, Link, Loading, Segmented, Tabs, TextTooltip, Empty} from '../../ui/ui';
import Download from '../../ui/icons/Download';
import Refresh from '../../ui/icons/Refresh';
import {CodeEditor} from '../../ui/code/CodeEditor';
import {Wizard} from './Wizard';
import type {PageProps} from '../types';
import {useConfigPage, useSourceCard, useValidateTab, type SourceCardProps, type ValidateTabProps} from './useConfigPage';
import {useModules, type ModulesProps} from './useModules';
export function Config(props: PageProps) {
  const t = useT();
  const {
    error,
    reload,
    loading,
    ready,
    metadata,
    redacted,
    tab,
    setTab,
    selectedId,
    select,
    sourceProps,
    wizardProps,
    validateProps,
    modulesProps,
    sourceModel,
    sourceOptions,
    exportSource,
    summaryTone,
    summaryText
  } = useConfigPage(props);
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
      {ready && (
        <Tabs
          label={t('nav.config')}
          value={tab}
          onChange={setTab}
          items={[
            {
              id: 'modules',
              label: t('config.tabModules'),
              content: modulesProps && <Modules {...modulesProps} />
            },
            ...(wizardProps
              ? [
                  {
                    id: 'setup',
                    label: t('config.wizard'),
                    content: <Wizard {...wizardProps} />
                  }
                ]
              : []),
            {
              id: 'source',
              label: t('config.tabSource'),
              content: (
                <>
                  <div className="rp-toolbar">
                    <LabeledSelect side label={t('config.source')} value={selectedId} onChange={select} items={sourceOptions} />
                    {sourceModel && (
                      <>
                        <Badge>{sourceModel.kind}</Badge>
                        <Light small tone={sourceModel.tone}>
                          {sourceModel.editable}
                        </Light>
                        <span className="rp-label">{sourceModel.facts}</span>
                      </>
                    )}
                    {sourceModel?.hasContent && (
                      <>
                        <span className="rp-grow" />
                        <Button onPress={exportSource}>
                          <Download />
                          {t('config.export')}
                        </Button>
                      </>
                    )}
                  </div>
                  {sourceProps && <SourceCard key={sourceModel!.id} {...sourceProps} />}
                </>
              )
            },
            {
              id: 'validate',
              label: t('config.tabValidate'),
              content: validateProps && <ValidateTab {...validateProps} />
            }
          ]}
        />
      )}
    </div>
  );
}

function Modules(props: ModulesProps) {
  const t = useT();
  const vm = useModules(props);
  return (
    <div className="rp-page">
      {vm.cards.map(card => (
        <section key={card.id} className="rp-card" aria-label={card.kind}>
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
                <Button isDisabled={card.editDisabled} onPress={card.edit}>
                  {t('config.edit')}
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
              {vm.diagnostics.length > 0 && (
                <div className="rp-list" role="list" aria-label={t('config.diagnostics')}>
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
                <Button accent isPending={vm.saving} isDisabled={vm.busy || !vm.dirty} onPress={() => void vm.save()}>
                  {t('config.save')}
                </Button>
                <Button isDisabled={vm.busy} onPress={vm.cancel}>
                  {t('ui.cancel')}
                </Button>
              </div>
            </>
          )}
        </section>
      ))}
    </div>
  );
}

function SourceCard(props: SourceCardProps) {
  const {canValidate, canWrite, contentOffered, focusLine} = props;
  const t = useT();
  const {
    editing,
    shown,
    marks,
    text,
    outbounds,
    jump,
    dirty,
    validate,
    save,
    edit,
    cancel,
    change,
    view,
    busy,
    validating,
    saving,
    validateDisabled,
    validateTip,
    editDisabled,
    editTip
  } = useSourceCard(props);
  return (
    <section className="rp-card">
      <div className="rp-row">
        <span className="rp-cluster">
          <h3 className="rp-h3 rp-code">{view.label}</h3>
          {dirty && (
            <>
              <Badge tone="warn">{t('config.unsaved')}</Badge>
              <span className="rp-label">{t('config.unsavedHint')}</span>
            </>
          )}
        </span>
        <span className="rp-cluster">
          {canValidate && (
            <Button isPending={validating} isDisabled={validateDisabled} tip={validateTip} onPress={() => void validate()}>
              {t('config.validate')}
            </Button>
          )}
          {canWrite && !editing && (
            <Button isDisabled={editDisabled} tip={editTip} onPress={edit}>
              {t('config.edit')}
            </Button>
          )}
          {editing && (
            <>
              <Button isDisabled={busy} onPress={cancel}>
                {t('ui.cancel')}
              </Button>
              <Button
                accent
                isPending={saving}
                isDisabled={busy || !dirty}
                tip={t(navigator.platform.startsWith('Mac') ? 'config.saveShortcutMac' : 'config.saveShortcut')}
                onPress={() => void save()}
              >
                {t('config.save')}
              </Button>
            </>
          )}
        </span>
      </div>
      {shown.length > 0 && (
        <div className="rp-list" role="list" aria-label={t('config.diagnostics')}>
          {shown.map((item, index) => (
            <div className="rp-cluster" role="listitem" key={index}>
              <Light small tone={item.tone}>
                {item.detail}
              </Light>
              <Button small quiet onPress={() => props.open(item.sourceId, item.line)}>
                {t('config.openSource')}
              </Button>
            </div>
          ))}
        </div>
      )}
      {!view.hasContent ? (
        // With content on, a withheld source is the one holding the API credential.
        <Empty>{t(contentOffered ? 'config.contentCredential' : 'config.contentHidden')}</Empty>
      ) : (
        <CodeEditor
          label={view.label}
          value={text}
          readOnly={!editing || busy}
          onChange={editing ? change : undefined}
          marks={marks}
          focusLine={jump ?? focusLine}
          outbounds={outbounds}
          onSave={editing && dirty && !busy ? () => void save() : undefined}
        />
      )}
      <span className="rp-label">{t(canWrite ? 'config.editNote' : 'config.readNote')}</span>
    </section>
  );
}

function ValidateTab(props: ValidateTabProps) {
  const {canValidate, open} = props;
  const t = useT();
  const {level, setLevel, selected, setSelected, shown, cur, validate, summaryTone, summary, lastRun, validating, blocked, tip, levels} = useValidateTab(props);
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
            <Refresh />
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
          {id: 'code', label: t('config.code'), minWidth: 140, drop: 1, render: item => <span className="rp-code">{item.code}</span>}
        ]}
      />
      {cur && (
        <div className="rp-cluster">
          <Light small tone={cur.tone}>
            {cur.detail}
          </Light>
          <Button onPress={() => open(cur.sourceId, cur.line)}>{t('config.openSource')}</Button>
        </div>
      )}
    </>
  );
}
