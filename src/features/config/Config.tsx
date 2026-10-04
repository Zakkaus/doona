import {useT} from '../../i18n';
import {Badge, Button, ErrorMessage, HelpRow, Kv, LabeledSelect, Light, PageSkeleton, Tabs, TextTooltip, Toolbar, type PageShape} from '../../ui/ui';
import Download from '../../ui/icons/Download';
import type {PageProps} from '../../shell/routes';
import {useConfigPage} from './useConfigPage';
import {ConfigHistory} from './ConfigHistory';
import {Modules} from './Modules';
import {GlobalSettings} from './GlobalSettings';
import {NewSource} from './NewSource';
import {SourceCard} from './SourceCard';
// The first read's Skeletons: the summary row, each tab's body (the module cards, the source editor under its
// toolbar), and the tab row over the editor, the usual first tab, while the tabs are not known yet.
const summaryRow: PageShape = [{toolbar: 3, height: 24}];
const moduleCards: PageShape = [{cards: [94, 94, 94, 94, 94, 94, 94], gap: 'page'}];
// The editor's height follows the file, so its block is a typical file's.
const sourceEditor: PageShape = [{toolbar: 1, height: 16}, {block: 560}];
const tabsAndEditor: PageShape = [{tabs: 3}, {toolbar: 1}, ...sourceEditor];
export function Config(props: PageProps) {
  const t = useT();
  const {
    error,
    reload,
    loading,
    ready,
    tabsReady,
    metadata,
    redacted,
    tabs,
    tab,
    setTab,
    selectedId,
    select,
    sourceProps,
    newSourceProps,
    modulesProps,
    sourceModel,
    sourceOptions,
    exportSource,
    summaryTone,
    summaryText
  } = useConfigPage(props);
  const content = {
    history: <ConfigHistory />,
    modules: modulesProps ? <Modules {...modulesProps} /> : loading && <PageSkeleton panel shape={moduleCards} />,
    global: <GlobalSettings {...props} />,
    source: (
      <>
        <Toolbar page>
          <span className="rp-cluster nowrap rp-source-pick">
            <LabeledSelect side cut="path" label={t('config.source')} value={selectedId} onChange={select} items={sourceOptions} />
            {sourceModel && (
              <>
                {sourceModel.readOnly && (
                  <HelpRow help={sourceModel.readOnly.help}>
                    <Badge>{sourceModel.readOnly.label}</Badge>
                  </HelpRow>
                )}
                <TextTooltip className="rp-label" text={sourceModel.loaded}>
                  {sourceModel.facts}
                </TextTooltip>
              </>
            )}
          </span>
          {(newSourceProps || sourceModel) && (
            <span className="rp-cluster nowrap">
              {newSourceProps && <NewSource {...newSourceProps} />}
              {sourceModel && (
                <Button onPress={exportSource}>
                  <Download />
                  {t('config.export')}
                </Button>
              )}
            </span>
          )}
        </Toolbar>
        {sourceModel && <span className="rp-label">{t('config.exportWarning')}</span>}
        {sourceProps ? <SourceCard key={sourceModel!.id} {...sourceProps} /> : loading && <PageSkeleton panel shape={sourceEditor} />}
      </>
    )
  };
  return (
    <div className="rp-page">
      <ErrorMessage error={error} onRetry={reload} />
      {/* The summary row's Skeleton; the tabs below show as soon as they are known, each with its body's Skeleton. */}
      {loading && <PageSkeleton shape={tabsReady ? summaryRow : [...summaryRow, ...tabsAndEditor]} />}
      {ready && (
        <Toolbar page>
          <Kv row items={metadata} />
          <Light small tone={summaryTone}>
            {summaryText}
          </Light>
          {redacted && (
            <Light small tone="muted">
              {t('config.redacted')}
            </Light>
          )}
        </Toolbar>
      )}
      {tabsReady && <Tabs page label={t('nav.config')} value={tab} onChange={setTab} items={tabs.map(item => ({...item, content: content[item.id]}))} />}
    </div>
  );
}
