import {useT} from '../../i18n';
import {Badge, Button, ErrorMessage, HelpRow, Kv, LabeledSelect, Light, Loading, Tabs, TextTooltip} from '../../ui/ui';
import Download from '../../ui/icons/Download';
import type {PageProps} from '../../shell/routes';
import {useConfigPage} from './useConfigPage';
import {Modules} from './Modules';
import {NewSource} from './NewSource';
import {SourceCard} from './SourceCard';
import {ValidateTab} from './ValidateTab';
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
    source: (
      <>
        <div className="rp-toolbar">
          <span className="rp-cluster nowrap rp-source-pick">
            <LabeledSelect side cut="start" label={t('config.source')} value={selectedId} onChange={select} items={sourceOptions} />
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
        </div>
        {sourceModel && <span className="rp-label">{t('config.exportWarning')}</span>}
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
