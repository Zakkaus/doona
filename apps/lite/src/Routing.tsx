// Copyright (c) Meta Platforms, Inc. and affiliates.
// Layout adapted from the Astryx settings template; see ASTRYX-TEMPLATES-LICENSE.

import {Button} from '@astryxdesign/core/Button';
import {lazy, startTransition, Suspense, useCallback, useEffect, useRef, useState, type ReactNode} from 'react';

import {Badge} from '@astryxdesign/core/Badge';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {Divider} from '@astryxdesign/core/Divider';
import {Grid} from '@astryxdesign/core/Grid';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {Selector} from '@astryxdesign/core/Selector';
import {LoadingText, loadingControl} from './ui/LoadingText';
import {Heading, Text} from '@astryxdesign/core/Text';
import {readMode, sameMode, writeMode, type OutboundMode} from '../../../src/dae/outboundMode';
import {builtinOutbounds} from '../../../src/dae/vocab';
import {applyContent, mainSnapshot, readMain, type Connection} from './api';
import {useMessages} from './i18n';
import {changeCount, parseRuleList, stageAuthoredRules} from './ruleDraft';
import {RuleTester} from './RuleTester';
import {useExportDraft} from './ui/exportDraft';
import {RuleList} from './RuleList';
import {ruleReview} from './ruleReview';
import {useDraftBase, useFocusRefresh, useRead, useTask} from './state';
import {Feedback, ReadState, useNoticeToast} from './ui';
import {hasPendingRuleCommand, requestPageCommand, useCommand} from './ui/commands';
import {DraftBar} from './ui/DraftBar';
import {useDraftGuard} from './ui/draftGuard';
import {editorLayout} from './ui/editorLayout';
import {focusRing} from './ui/focusRing';
import {Crossfade, RowEntrance} from './ui/motion';
import {DraftPresence} from './ui/motion/DraftPresence';
import {PageFrame, pageRhythm} from './ui/PageFrame';
import {useCardRadioGroup} from './ui/useCardRadioGroup';
import {focusPageHeading} from './ui/usePageMotion';

import {canWrite, sectionText, validateContent, writeSection} from './config';
import {codeEditorChunk} from './preload';
import {ReviewDialog} from './ui/ReviewDialog';

const TemplatePicker = lazy(() => import('./TemplatePicker'));
const LiteCodeEditor = codeEditorChunk.Component;
const modes = ['rule', 'direct', 'global'] as const;
const descriptions = {rule: 'ruleDescription', direct: 'directDescription', global: 'globalDescription'} as const;

export function Routing({connection, setBusy}: {connection: Connection; setBusy: (busy: boolean) => void}) {
  const {api, capabilities} = connection;
  const t = useMessages();
  const read = useRead(
    useCallback(
      async (signal?: AbortSignal) => {
        const [source, groups] = await Promise.all([readMain(api, signal), capabilities.resources.groups.available ? api.groups(signal) : Promise.resolve([])]);
        return {source, groups};
      },
      [api, capabilities]
    )
  );
  const [draft, setDraft] = useState<OutboundMode | null>(null);
  const [rules, setRules] = useState<string | null>(null);
  const [testerOpen, setTesterOpen] = useState(false);
  const [revealRequest, setRevealRequest] = useState<{index: number} | null>(null);
  const revealTestRule = useCallback((index: number) => {
    setTextMode(false);
    setRevealRequest({index});
  }, []);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [textMode, setTextMode] = useState(false);
  useCommand(command => {
    if (command === 'add-rule' || command === 'search-target') setTextMode(false);
  });
  const [candidate, setCandidate] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const focusAfterApply = useRef(false);
  const dialogRef = useCallback((dialog: HTMLDialogElement | null) => {
    if (!dialog) return;
    const closed = () => {
      if (focusAfterApply.current) {
        focusAfterApply.current = false;
        focusPageHeading();
      }
    };
    dialog.addEventListener('close', closed);
    return () => dialog.removeEventListener('close', closed);
  }, []);
  const ready = read.data !== undefined;
  const task = useTask(setBusy);
  useNoticeToast(task.notice);
  const base = useDraftBase(read.data?.source, draft !== null || rules !== null);
  const layoutSource = base ?? mainSnapshot(api);
  const current = layoutSource ? readMode(layoutSource.content) : ({mode: 'rule'} as const);
  const shown = draft ?? current;
  const writable = canWrite(connection, read.data?.source);
  const enabled = writable && !read.loading && read.error === undefined && task.busy === null;
  const modeDirty = current && draft && !sameMode(current, draft);
  const dirty = modeDirty || (rules !== null && base && rules !== sectionText(base.content, 'routing'));
  useDraftGuard(!!dirty, () => {
    setDraft(null);
    setRules(null);
  });
  useExportDraft(base, !!dirty, () => {
    let content = rules === null ? base!.content : writeSection(base!.content, 'routing', rules);
    if (draft && modeDirty) content = writeMode(content, draft);
    return content;
  });
  useFocusRefresh(read.reload, !!read.data && !dirty && task.busy === null);
  const target = shown?.mode === 'global' ? shown.target : (read.data?.groups[0]?.name ?? '');
  const label = (mode: OutboundMode) => (mode.mode === 'global' ? `${t.global} (${mode.target})` : t[mode.mode]);
  const close = () => {
    if (task.busy === null) setOpen(false);
  };
  const select = (value: string) => {
    if (enabled) setDraft(value === 'global' ? {mode: value, target} : {mode: value as 'rule' | 'direct'});
  };
  const {group, onKeyDown} = useCardRadioGroup(modes, select, 'data-mode');
  const reload = async () => {
    setDraft(null);
    setRules(null);
    return read.reload();
  };
  const review = () =>
    void task.run('validate', async () => {
      let content = rules === null ? base!.content : writeSection(base!.content, 'routing', rules);
      if (draft && modeDirty) content = writeMode(content, draft);
      else if (rules !== null) writeMode(content, readMode(content)); // Validate mode precedence without rewriting its marker.
      await validateContent(connection, base!, content);
      setCandidate(content);
      setOpen(true);
      return undefined;
    });
  const originalRules = sectionText(layoutSource?.content ?? '', 'routing');
  const authoredRules = writeMode(rules ?? originalRules, {mode: 'rule'});
  const stageRules = (next: string) => setRules(stageAuthoredRules(rules ?? originalRules, next));
  const editorMode = (
    <SegmentedControl
      size="md"
      isDisabled={!ready}
      label={t.editorMode}
      value={textMode ? 'text' : 'visual'}
      onChange={value => startTransition(() => setTextMode(value === 'text'))}
    >
      <SegmentedControlItem value="visual" label={t.visualMode} />
      <SegmentedControlItem
        value="text"
        label={t.textMode}
        onPointerEnter={() => void codeEditorChunk.preload().catch(() => {})}
        onFocus={() => void codeEditorChunk.preload().catch(() => {})}
      />
    </SegmentedControl>
  );
  return (
    <PageFrame
      title={t.routing}
      description={t.routingDescription}
      actions={
        <>
          {editorMode}
          {capabilities.resources.routing_trace?.available && (
            <Button label={t.testRules} variant="secondary" size="md" isDisabled={!ready} onClick={() => startTransition(() => setTesterOpen(true))} />
          )}
          <Button
            label={t.addRule}
            style={{visibility: textMode ? 'hidden' : undefined}}
            variant={dirty ? 'secondary' : 'primary'}
            size="md"
            isDisabled={!enabled || parseRuleList(authoredRules, 'routing').ambiguous}
            onClick={() => requestPageCommand('add-rule')}
          />
        </>
      }
      ready={ready}
      refreshing={!!read.data && read.loading}
      footer={
        <DraftPresence>
          {dirty && read.data ? (
            <DraftBar
              count={(modeDirty ? 1 : 0) + changeCount(originalRules, rules ?? originalRules)}
              discard={() => {
                setDraft(null);
                setRules(null);
              }}
              review={review}
              pending={task.busy !== null}
              disabled={!enabled || (shown?.mode === 'global' && !target)}
            />
          ) : undefined}
        </DraftPresence>
      }
      content={
        <VStack gap={pageRhythm.section}>
          <RuleTester
            connection={connection}
            open={testerOpen}
            close={() => setTesterOpen(false)}
            dirty={!!dirty}
            shownRules={authoredRules}
            reveal={revealTestRule}
          />
          <ReadState error={read.error} reload={reload} />
          {task.notice && 'error' in task.notice && <Feedback notice={task.notice} />}
          {shown && current && (
            <>
              <VStack gap={pageRhythm.section}>
                <VStack gap={1}>
                  <Heading level={2}>{t.mode}</Heading>
                </VStack>
                <VStack gap={pageRhythm.section}>
                  {ready && !writable && <Text>{t.readOnly}</Text>}
                  <RowEntrance>
                    <Grid
                      ref={group}
                      role="radiogroup"
                      aria-label={t.mode}
                      aria-busy={!ready && read.loading}
                      inert={!ready && read.loading}
                      data-loading-shape={!ready && read.loading ? 'routing-modes' : undefined}
                      xstyle={editorLayout.modes}
                    >
                      {modes.map((value, index) => (
                        <SelectableCard
                          key={value}
                          label={t[value]}
                          role="radio"
                          aria-label={t[value]}
                          aria-checked={shown.mode === value}
                          isSelected={shown.mode === value}
                          isDisabled={!enabled}
                          tabIndex={shown.mode === value ? 0 : -1}
                          data-mode={value}
                          xstyle={focusRing}
                          padding={5}
                          onChange={() => select(value)}
                          onKeyDown={event => {
                            if (enabled) onKeyDown(event, index);
                          }}
                        >
                          <VStack gap={2}>
                            <HStack gap={2} wrap="wrap" vAlign="center">
                              <LoadingText weight="medium" loading={!ready && read.loading} children={t[value]} />
                              {current.mode === value && <Badge {...loadingControl(!ready && read.loading, 'label', t.modeActive)} variant="neutral" />}
                              {modeDirty && shown.mode === value && <Badge label={t.modePending} variant="neutral" />}
                            </HStack>
                            <LoadingText color="secondary" type="supporting" textWrap="wrap" loading={!ready && read.loading}>
                              {t[descriptions[value]]}
                            </LoadingText>
                          </VStack>
                        </SelectableCard>
                      ))}
                    </Grid>
                  </RowEntrance>
                  <Crossfade swapKey={shown.mode} gap={pageRhythm.section}>
                    {shown.mode === 'global' && (
                      <Selector
                        label={t.target}
                        value={target}
                        width="100%"
                        hasSearch
                        isDisabled={!enabled || !(read.data?.groups ?? []).length}
                        options={(read.data?.groups ?? []).map(item => ({value: item.name, label: item.name}))}
                        onChange={value => setDraft({mode: 'global', target: value})}
                      />
                    )}
                    {shown.mode === 'global' && !target && <Text>{t.noTarget}</Text>}
                  </Crossfade>
                </VStack>
              </VStack>
              <Divider />
              <VStack gap={pageRhythm.section}>
                <VStack gap={pageRhythm.section} data-editor-content="routing">
                  {templateOpen && (
                    <Suspense fallback={null}>
                      <TemplatePicker
                        text={authoredRules}
                        groups={(read.data?.groups ?? []).map(item => item.name)}
                        close={() => setTemplateOpen(false)}
                        stage={stageRules}
                      />
                    </Suspense>
                  )}
                  <RuleVisibility key={shown.mode} mode={shown.mode} textMode={textMode} reveal={revealRequest}>
                    <RuleList
                      revealRequest={revealRequest}
                      heading={
                        <VStack gap={1}>
                          <Heading level={2}>{t.rulesEditor}</Heading>
                          <Text type="supporting" color="secondary">
                            {t.rulesHelp}
                          </Text>
                        </VStack>
                      }
                      textMode={textMode}
                      showVisual={() => setTextMode(false)}
                      renderContent={content => (
                        <Crossfade swapKey={textMode ? 'text' : 'list'} gap={pageRhythm.section}>
                          {textMode ? (
                            <VStack data-code-editor>
                              <Suspense fallback={null}>
                                <LiteCodeEditor
                                  label={t.rulesEditor}
                                  value={rules ?? sectionText(base!.content, 'routing')}
                                  onChange={setRules}
                                  disabled={!enabled}
                                  kind="routing"
                                  connection={connection}
                                  source={base!}
                                  targets={(read.data?.groups ?? []).map(item => item.name)}
                                />
                              </Suspense>
                            </VStack>
                          ) : (
                            content
                          )}
                        </Crossfade>
                      )}
                      loading={!ready && read.loading}
                      text={authoredRules}
                      controls={
                        <>
                          <Button label={t.routingTemplates} variant="secondary" size="md" isDisabled={!enabled} onClick={() => setTemplateOpen(true)} />
                        </>
                      }
                      hideAdd
                      primary={!dirty}
                      kind="routing"
                      targets={[...builtinOutbounds, ...(read.data?.groups ?? []).map(item => item.name)]}
                      disabled={!enabled}
                      change={stageRules}
                      editText={() => setTextMode(true)}
                    />
                  </RuleVisibility>
                </VStack>
              </VStack>
              <ReviewDialog
                open={open}
                dialogRef={dialogRef}
                close={close}
                pending={task.busy !== null}
                disabled={!enabled}
                summary={[
                  ...(modeDirty && draft ? [t.reviewModeChange.replace('{before}', label(current)).replace('{after}', label(draft))] : []),
                  ...(rules !== null && rules !== originalRules ? ruleReview(writeMode(originalRules, {mode: 'rule'}), authoredRules, 'routing', t) : [])
                ]}
                before={base?.content ?? ''}
                after={candidate ?? base?.content ?? ''}
                confirm={() => {
                  if (!candidate || !dirty || !enabled || !read.data || !base) return;
                  const snapshot = read.data;
                  const draftSource = base;
                  const change = candidate;
                  void task.run('routing', async () => {
                    try {
                      const source = await applyContent(connection, draftSource, change);
                      read.setData({...snapshot, source});
                      setDraft(null);
                      setRules(null);
                      return {key: 'routingSaved'};
                    } finally {
                      focusAfterApply.current = true;
                      setOpen(false);
                    }
                  });
                }}
              />
            </>
          )}
        </VStack>
      }
    />
  );
}

function RuleVisibility({
  mode,
  textMode,
  reveal,
  children
}: {
  reveal: {index: number} | null;
  mode: OutboundMode['mode'];
  textMode: boolean;
  children: ReactNode;
}) {
  const t = useMessages();
  const [expanded, setExpanded] = useState(() => textMode || hasPendingRuleCommand('routing'));
  useCommand(command => {
    if (command === 'add-rule' || command === 'search-target') setExpanded(true);
  });
  useEffect(() => {
    if (reveal) setExpanded(true);
  }, [reveal]);
  if (mode === 'rule') return children;
  return (
    <Collapsible
      isOpen={expanded}
      onOpenChange={setExpanded}
      chevronPosition="start"
      trigger={<Text type="label">{mode === 'global' ? t.globalRulesInactive : t.directRulesInactive}</Text>}
    >
      <VStack paddingBlockStart={pageRhythm.section}>{expanded && children}</VStack>
    </Collapsible>
  );
}
