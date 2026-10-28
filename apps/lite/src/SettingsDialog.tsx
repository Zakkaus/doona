import {Banner} from '@astryxdesign/core/Banner';
import {numberSetting} from '../../../src/dae/settings';
import {SettingNumber} from './ui/SettingNumber';
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Layout adapted from the Astryx settings-dialog template; see ASTRYX-TEMPLATES-LICENSE.

import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Dialog} from '@astryxdesign/core/Dialog';
import {Divider} from '@astryxdesign/core/Divider';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {HStack, Layout, LayoutContent, StackItem, VStack} from '@astryxdesign/core/Layout';
import {Link as TextLink} from '@astryxdesign/core/Link';
import {useToast} from '@astryxdesign/core/Toast';
import {Selector} from '@astryxdesign/core/Selector';
import {SideNav, SideNavItem, SideNavSection} from '@astryxdesign/core/SideNav';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {Heading, Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import * as stylex from '@stylexjs/stylex';
import {useCallback, useId, useState} from 'react';
import {honkGlobal} from '../../../src/api/engines/honkSettings';
import {serializeSetting, settingValue, writeSettings} from '../../../src/dae/settings';
import {blockFields, scanConfig} from '../../../src/dae/text';
import {copyText} from '../../../src/features/shared/copy';
import {applyContent, readMain, type Connection} from './api';
import {usePreferences} from './app/preferences';
import {canWrite, validateContent} from './config';
import {localeNames, useMessages, type MessageKey} from './i18n';
import {docsHref} from './docs';
import {useRead, useTask} from './state';
import {Feedback, ReadState, useNoticeToast} from './ui';
import {ReviewBody} from './ui/ReviewDialog';
import {CheckmarkCircle, Copy, FileText, Lighten, Link, Settings, SpeedFast, Translate, Visibility} from './ui/icons';
import {geometry, MEDIA} from './ui/metrics.stylex';
import {Crossfade, RowEntrance} from './ui/motion';
import {RowTooltip as Tooltip} from './ui/RowTooltip';
import {ThemeChoices} from './ui/ThemeChoices';

const styles = stylex.create({
  sideNav: {flexShrink: 0},
  sideNavSection: {paddingBlock: 'var(--spacing-2)'},
  closeAnchor: {position: 'sticky', insetBlockStart: 0, zIndex: 1, height: 0},
  closeBacking: {display: 'flex', backgroundColor: 'var(--color-background-surface)', borderRadius: 'var(--radius-element)'},
  shell: {height: geometry.settingsHeight},
  panel: {containerType: 'inline-size', containerName: 'settings-panel'},
  row: {
    display: 'flex',
    flexDirection: {default: 'row', '@container settings-panel (max-width: 480px)': 'column'},
    alignItems: {default: 'center', '@container settings-panel (max-width: 480px)': 'stretch'},
    gap: {default: 'var(--spacing-3)', '@container settings-panel (max-width: 480px)': 'var(--spacing-2)'}
  },
  control: {flexShrink: 0}
});
const restartCommand = 'systemctl restart honk-core';
// honk rejects these changes before storing a source. The API has no staged-save mode.
const restartOnly = new Set([
  'check_interval',
  'tcp_check_url',
  'tcp_check_http_method',
  'udp_check_dns',
  'tls_implementation',
  'tproxy_port',
  'tproxy_port_protect',
  'pprof_port',
  'so_mark_from_dae',
  'log_level',
  'log_file',
  'lan_interface',
  'wan_interface',
  'auto_config_kernel_parameter',
  'data_dir',
  'store_subscribe',
  'nfqueue_enable'
]);
const panels = ['general', 'networkSettings', 'sniffing', 'healthCheck', 'bandwidth', 'storage', 'appearance', 'language'] as const;
type Panel = (typeof panels)[number];
const panelIcons = {
  general: Settings,
  networkSettings: Link,
  sniffing: Visibility,
  healthCheck: CheckmarkCircle,
  bandwidth: SpeedFast,
  storage: FileText,
  appearance: Lighten,
  language: Translate
} satisfies Record<Panel, unknown>;
function fieldPanel(key: string, group: string): Panel {
  if (key === 'sniffing_timeout') return 'sniffing';
  if (group === 'logging' || ['tproxy_port', 'tproxy_port_protect', 'pprof_port'].includes(key)) return 'general';
  if (group === 'interfaces' || group === 'dialing') return 'networkSettings';
  if (group === 'checks') return 'healthCheck';
  return group as Panel;
}

export function SettingsDialog({
  connection,
  setBusy,
  close,
  isOpen
}: {
  connection: Connection;
  setBusy: (busy: boolean) => void;
  close: () => void;
  isOpen: boolean;
}) {
  const t = useMessages();
  const prefs = usePreferences();
  const toast = useToast();
  const titleId = useId();
  const isNarrow = useMediaQuery(MEDIA.settings);
  const [active, setActive] = useState<Panel>('general');
  const [query, setQuery] = useState('');
  const [patch, setPatch] = useState<Record<string, string>>({});
  const [candidate, setCandidate] = useState<string | null>(null);
  const read = useRead(
    useCallback(
      (signal?: AbortSignal) => (isOpen && connection.capabilities.resources.config.available ? readMain(connection.api, signal) : Promise.resolve(undefined)),
      [connection, isOpen]
    )
  );
  const task = useTask(setBusy);
  useNoticeToast(task.notice);
  const copy = async (text: string, label: string) => {
    try {
      const copied = await copyText(text);
      toast(copied ? {body: t.restartCopied.replace('{label}', label), type: 'info'} : {body: t.restartCopyFailed, type: 'error'});
    } catch {
      toast({body: t.restartCopyFailed, type: 'error'});
    }
  };
  const sourcePath = read.data?.path;
  const openFile = sourcePath && sourcePath !== '<redacted>' ? t.restartOpenFile.replace('{path}', sourcePath) : t.restartOpenMainFile;
  const pending = task.busy !== null;
  const [editingNumber, setEditingNumber] = useState(false);
  const writable = canWrite(connection, read.data) && connection.capabilities.resources.config_validate.modes?.includes('full');
  const disabled = !writable || read.loading || pending;
  const scan = scanConfig(read.data?.content ?? '');
  const block = scan.blocks.find(item => item.name === 'global');
  const fields = read.data && block ? blockFields(read.data.content, block, scan.tokens) : [];
  const invalid = honkGlobal.fields.some(field => Object.hasOwn(patch, field.key) && serializeSetting(field, patch[field.key]) === null);
  const select = (panel: Panel) => {
    setActive(panel);
    setQuery('');
  };
  const dismiss = () => {
    if (!pending) {
      setPatch({});
      setCandidate(null);
      setQuery('');
      setActive('general');
      close();
    }
  };
  const icon = (panel: Panel) => panelIcons[panel];
  const matches = panels.filter(panel =>
    [t[panel], ...honkGlobal.fields.filter(f => fieldPanel(f.key, f.group ?? '') === panel).flatMap(f => [f.key, t[`setting_${f.key}` as MessageKey]])]
      .join(' ')
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase())
  );
  const search = (
    <TextInput
      label={t.searchSettings}
      isLabelHidden
      placeholder={t.searchSettings}
      size="sm"
      width="100%"
      hasClear
      value={query}
      onChange={setQuery}
      isDisabled={pending || !!candidate}
    />
  );
  const nav = (items: readonly Panel[]) => (
    <RowEntrance>
      <VStack as="ul" gap={0.5}>
        {items.map(panel => (
          <VStack as="li" key={panel}>
            <SideNavItem
              key={panel}
              label={t[panel]}
              icon={<Icon icon={icon(panel)} size="sm" color="primary" />}
              isSelected={active === panel}
              isDisabled={pending || !!candidate}
              onClick={() => select(panel)}
            />
          </VStack>
        ))}
      </VStack>
    </RowEntrance>
  );
  const heading = (
    <VStack gap={0.5}>
      <Heading level={2}>{candidate ? t.reviewConfig : t[active]}</Heading>
      {!candidate && (
        <Text type="supporting" color="secondary">
          {['appearance', 'language'].includes(active) ? t.preferencesImmediate : t.globalSettingsDescription}
        </Text>
      )}
    </VStack>
  );
  const actions = (
    <HStack gap={2} justify="end" wrap="wrap">
      {!candidate && Object.keys(patch).length > 0 && <Button label={t.resetOriginal} variant="ghost" isDisabled={pending} onClick={() => setPatch({})} />}
      {candidate && <Button label={t.cancel} variant="secondary" isDisabled={pending} onClick={() => setCandidate(null)} />}
      <Button
        label={candidate ? t.applyConfig : t.preview}
        variant="primary"
        isLoading={pending}
        isDisabled={disabled || invalid || (!Object.keys(patch).length && !editingNumber)}
        onClick={() =>
          void task.run(candidate ? 'apply' : 'validate', async () => {
            if (!read.data) return undefined;
            if (!candidate) {
              const next = writeSettings(read.data.content, honkGlobal, 0, patch);
              await validateContent(connection, read.data, next);
              setCandidate(next);
              return undefined;
            }
            const source = await applyContent(connection, read.data, candidate);
            read.setData(source);
            setPatch({});
            setCandidate(null);
            return {key: 'changesSaved'};
          })
        }
      />
    </HStack>
  );
  const body = (
    <>
      <ReadState error={read.error} reload={read.reload} />
      {task.notice && 'error' in task.notice && Object.keys(patch).length > 0 && <Feedback notice={task.notice} />}
      {candidate && read.data ? (
        <>
          <ReviewBody
            summary={Object.entries(patch).map(([key, value]) => {
              const field = honkGlobal.fields.find(item => item.key === key);
              const was = field ? settingValue(field, fields.find(item => item.name === key)?.value ?? '') : '';
              return t.reviewSetting
                .replace('{label}', t[`setting_${key}` as MessageKey] ?? key)
                .replace('{before}', was || t.defaultValue)
                .replace('{after}', value || t.defaultValue);
            })}
            before={read.data.content}
            after={candidate}
          />
          {actions}
        </>
      ) : (
        <>
          {active === 'appearance' ? (
            <Card padding={0} width="100%" variant="muted">
              <VStack padding={4} gap={2}>
                <HStack gap={2}>
                  <Icon icon={Lighten} size="sm" color="secondary" />
                  <Text type="label">{t.theme}</Text>
                </HStack>
                <ThemeChoices value={prefs.mode} onChange={prefs.setMode} />
              </VStack>
            </Card>
          ) : active === 'language' ? (
            <Card padding={0} width="100%" variant="muted">
              <VStack padding={4}>
                <Selector
                  size="sm"
                  label={t.language}
                  width={192}
                  value={prefs.locale}
                  onChange={v => prefs.setLocale(v as typeof prefs.locale)}
                  options={Object.entries(localeNames).map(([value, label]) => ({value, label}))}
                />
              </VStack>
            </Card>
          ) : (
            <>
              {!writable && !read.loading && <Text color="secondary">{t.readOnly}</Text>}
              {[false, true].map(restart => {
                const list = honkGlobal.fields.filter(f => fieldPanel(f.key, f.group ?? '') === active && restartOnly.has(f.key) === restart);
                if (!list.length) return null;
                return (
                  <VStack key={String(restart)} gap={3}>
                    {restart && (
                      <Banner status="info" title={t.restartBanner} collapsible={false}>
                        <VStack gap={2}>
                          <Text style={{overflowWrap: 'anywhere'}}>{openFile}</Text>
                          <Text>{t.restartEditGlobal}</Text>
                          <HStack gap={2} align="center" wrap="wrap">
                            <Text>{t.restartService}</Text>
                            <Text style={{overflowWrap: 'anywhere'}}>
                              <code>{restartCommand}</code>
                            </Text>
                            <Tooltip content={t.restartCopyCommand}>
                              <IconButton
                                label={t.restartCopy}
                                icon={<Icon icon={Copy} size="sm" />}
                                variant="ghost"
                                size="sm"
                                onClick={() => void copy(restartCommand, t.restartCommand)}
                              />
                            </Tooltip>
                          </HStack>
                          <TextLink href={docsHref(prefs.locale, 'reload-and-restart')} isExternalLink>
                            {t.restartDocs}
                          </TextLink>
                        </VStack>
                      </Banner>
                    )}
                    <Card padding={0} width="100%" variant="muted">
                      <RowEntrance key={active}>
                        <VStack as="ul" role="list" gap={0}>
                          {list.map((field, index) => {
                            const label = t[`setting_${field.key}` as MessageKey];
                            const value = patch[field.key] ?? settingValue(field, fields.find(f => f.name === field.key)?.value ?? '');
                            const options = field.type === 'boolean' ? ['true', 'false'] : field.choices;
                            const update = (next: string) => setPatch(old => ({...old, [field.key]: next}));
                            return (
                              <VStack key={field.key} as="li" gap={0}>
                                {index > 0 && <Divider variant="subtle" />}
                                <VStack padding={4} gap={2}>
                                  <HStack xstyle={styles.row}>
                                    <StackItem size="fill">
                                      <Text type="label">{label}</Text>
                                    </StackItem>
                                    <VStack xstyle={!restart && styles.control} style={{minWidth: 0}}>
                                      {restart ? (
                                        <HStack gap={2} align="center">
                                          <Text color="secondary" style={{overflowWrap: 'anywhere', minWidth: 0}}>
                                            {value || t.defaultValue}
                                          </Text>
                                          <Tooltip content={t.restartCopyLine}>
                                            <IconButton
                                              label={t.restartCopy}
                                              icon={<Icon icon={Copy} size="sm" />}
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => void copy(value ? `${field.key}: ${value}` : `${field.key}: `, label)}
                                            />
                                          </Tooltip>
                                        </HStack>
                                      ) : options && field.type !== 'integer' ? (
                                        <Selector
                                          size="sm"
                                          label={label}
                                          isLabelHidden
                                          width={192}
                                          value={value}
                                          options={[
                                            {value: '', label: t.defaultValue},
                                            ...[...new Set([...options, ...(value ? [value] : [])])].map(item => ({value: item, label: item}))
                                          ]}
                                          onChange={update}
                                          isDisabled={disabled}
                                        />
                                      ) : numberSetting(field) || field.type === 'duration' ? (
                                        <SettingNumber
                                          field={field}
                                          value={value}
                                          label={label}
                                          change={update}
                                          disabled={disabled}
                                          onEditing={setEditingNumber}
                                        />
                                      ) : (
                                        <TextInput
                                          size="sm"
                                          label={label}
                                          isLabelHidden
                                          width={192}
                                          value={value}
                                          placeholder={t.defaultValue}
                                          onChange={update}
                                          isDisabled={disabled}
                                          status={
                                            Object.hasOwn(patch, field.key) && serializeSetting(field, value) === null
                                              ? {type: 'error', message: t.invalidField}
                                              : undefined
                                          }
                                        />
                                      )}
                                    </VStack>
                                  </HStack>
                                </VStack>
                              </VStack>
                            );
                          })}
                        </VStack>
                      </RowEntrance>
                    </Card>
                  </VStack>
                );
              })}
              {actions}
            </>
          )}
        </>
      )}
    </>
  );
  const closeButton = <IconButton label={t.close} variant="ghost" size="sm" icon={<Icon icon="close" size="sm" />} isDisabled={pending} onClick={dismiss} />;
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={open => {
        if (!open) dismiss();
      }}
      purpose={pending ? 'required' : 'form'}
      width={1120}
      maxHeight={geometry.settingsHeight}
      padding={0}
      aria-labelledby={titleId}
    >
      <VStack xstyle={styles.shell}>
        {isNarrow ? (
          <VStack gap={0} height="100%">
            <HStack gap={2} align="center" paddingInline={3} paddingBlock={3}>
              <StackItem size="fill">
                <Text type="label" id={titleId}>
                  {t.settings}
                </Text>
              </StackItem>
              {closeButton}
            </HStack>
            <Divider />
            <VStack paddingInline={3} paddingBlock={2}>
              {search}
            </VStack>
            {query.trim() ? (
              <VStack paddingInline={3} isScrollable>
                {nav(matches)}
                {!matches.length && <Text>{t.noMatches}</Text>}
              </VStack>
            ) : (
              <>
                <VStack paddingInline={3} paddingBlock={2}>
                  <TabList role="tablist" aria-label={t.settingsSections} value={active} onChange={value => select(value as Panel)} size="sm">
                    {panels.map(panel => (
                      <Tab
                        key={panel}
                        id={`${titleId}-${panel}`}
                        value={panel}
                        panelId={`${titleId}-panel`}
                        label={t[panel]}
                        icon={<Icon icon={icon(panel)} size="sm" />}
                        aria-disabled={pending || !!candidate}
                      />
                    ))}
                  </TabList>
                </VStack>
                <Divider />
                <StackItem size="fill">
                  <VStack
                    role="tabpanel"
                    id={`${titleId}-panel`}
                    aria-labelledby={`${titleId}-${active}`}
                    tabIndex={0}
                    gap={4}
                    padding={4}
                    isScrollable
                    height="100%"
                    xstyle={styles.panel}
                  >
                    {heading}
                    <Crossfade swapKey={candidate ? 'review' : active} gap={4}>
                      {body}
                    </Crossfade>
                  </VStack>
                </StackItem>
              </>
            )}
          </VStack>
        ) : (
          <Layout
            start={
              <SideNav
                aria-label={t.settingsSections}
                xstyle={styles.sideNav}
                header={
                  <HStack gap={2} align="center" paddingInline={2} minHeight={32}>
                    <Heading level={4} id={titleId}>
                      {t.settings}
                    </Heading>
                  </HStack>
                }
                topContent={search}
              >
                {query.trim() ? (
                  <>
                    {nav(matches)}
                    {!matches.length && <Text>{t.noMatches}</Text>}
                  </>
                ) : (
                  <>
                    <SideNavSection title={t.settings} xstyle={styles.sideNavSection}>
                      {nav(panels.slice(0, 6))}
                    </SideNavSection>
                    <SideNavSection title={t.preferences} xstyle={styles.sideNavSection}>
                      {nav(panels.slice(6))}
                    </SideNavSection>
                  </>
                )}
              </SideNav>
            }
            content={
              <LayoutContent className="lite-dialog-content" isScrollable padding={4}>
                <HStack width="100%" justify="end" xstyle={styles.closeAnchor}>
                  <HStack xstyle={styles.closeBacking}>{closeButton}</HStack>
                </HStack>
                <VStack gap={4} xstyle={styles.panel}>
                  <HStack gap={2} align="start">
                    <StackItem size="fill">{heading}</StackItem>
                    <VStack aria-hidden="true" width={32} />
                  </HStack>
                  <Crossfade swapKey={candidate ? 'review' : active} gap={4}>
                    {body}
                  </Crossfade>
                </VStack>
              </LayoutContent>
            }
          />
        )}
      </VStack>
    </Dialog>
  );
}
