// Copyright (c) Meta Platforms, Inc. and affiliates.
// Layout adapted from the Astryx settings template; see ASTRYX-TEMPLATES-LICENSE.

import {useExportDraft} from './ui/exportDraft';
import {hasPendingRuleCommand, requestPageCommand, useCommand} from './ui/commands';
import {startTransition, Suspense, useCallback, useState} from 'react';

import {Button} from '@astryxdesign/core/Button';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {Divider} from '@astryxdesign/core/Divider';
import {VStack} from '@astryxdesign/core/Layout';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {Heading, Text} from '@astryxdesign/core/Text';
import {dnsUpstreamNames} from '../../../src/dae/ruleText';
import {applyContent, mainSnapshot, readMain, type Connection} from './api';
import {canWrite, sectionText, validateContent, writeSection} from './config';
import {DnsUpstreams} from './DnsUpstreams';
import {useMessages} from './i18n';
import {changeCount, findBlocks} from './ruleDraft';
import {RuleList} from './RuleList';
import {dnsReview} from './ruleReview';
import {useDraftBase, useFocusRefresh, useRead, useTask} from './state';
import {codeEditorChunk} from './preload';
import {Feedback, ReadOnlyNote, ReadState, useNoticeToast} from './ui';
import {DraftBar} from './ui/DraftBar';
import {useDraftGuard} from './ui/draftGuard';
import {Crossfade} from './ui/motion/Crossfade';
import {DraftPresence} from './ui/motion/DraftPresence';
import {PageFrame, pageRhythm} from './ui/PageFrame';
import {ReviewDialog} from './ui/ReviewDialog';

const LiteCodeEditor = codeEditorChunk.Component;
export function Dns({connection, setBusy}: {connection: Connection; setBusy: (busy: boolean) => void}) {
  const t = useMessages();
  const read = useRead(useCallback((signal?: AbortSignal) => readMain(connection.api, signal), [connection]));
  const ready = read.data !== undefined;
  const task = useTask(setBusy);
  useNoticeToast(task.notice);
  const [text, setText] = useState<string | null>(null);
  const base = useDraftBase(read.data, text !== null);
  const [textMode, setTextMode] = useState(false);
  const [advanced, setAdvanced] = useState(() => hasPendingRuleCommand('response'));
  useCommand(command => {
    if (command === 'search-target') {
      setTextMode(false);
      setAdvanced(true);
    }
  });
  const [candidate, setCandidate] = useState<string | null>(null);
  const writable = canWrite(connection, read.data);
  const disabled = !writable || read.loading || task.busy !== null;
  const original = sectionText((base ?? mainSnapshot(connection.api))?.content ?? '', 'dns');
  const shown = text ?? original;
  const dirty = text !== null && text !== original;
  useDraftGuard(dirty, () => setText(null));
  useExportDraft(base, dirty, () => writeSection(base!.content, 'dns', shown));
  useFocusRefresh(read.reload, !!read.data && !dirty && task.busy === null);
  const reload = async () => {
    setText(null);
    return read.reload();
  };
  const targets = dnsUpstreamNames(shown);
  const review = () =>
    void task.run('validate', async () => {
      const content = writeSection(base!.content, 'dns', shown);
      await validateContent(connection, base!, content);
      setCandidate(content);
      return undefined;
    });
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
      title={t.dns}
      description={t.dnsDescription}
      actions={
        <>
          {editorMode}
          <Button
            label={t.addUpstream}
            variant={dirty ? 'secondary' : 'primary'}
            size="md"
            isDisabled={disabled || findBlocks(shown, ['dns', 'upstream']).length > 1}
            onClick={() => {
              setTextMode(false);
              requestPageCommand('add-upstream');
            }}
          />
        </>
      }
      ready={ready}
      refreshing={!!read.data && read.loading}
      footer={
        <DraftPresence>
          {dirty ? (
            <DraftBar count={changeCount(original, shown)} discard={() => setText(null)} review={review} pending={task.busy !== null} disabled={disabled} />
          ) : undefined}
        </DraftPresence>
      }
      content={
        <VStack gap={pageRhythm.section}>
          <ReadState error={read.error} reload={reload} />
          {task.notice && 'error' in task.notice && !candidate && <Feedback notice={task.notice} />}
          {
            <>
              {ready && !writable && <ReadOnlyNote />}
              <VStack data-editor-content="dns">
                <DnsUpstreams
                  loading={!ready && read.loading}
                  heading={
                    <VStack gap={1}>
                      <Heading level={2}>{textMode ? t.dnsEditor : t.upstreams}</Heading>
                      <Text type="supporting" color="secondary">
                        {t.dnsHelp}
                      </Text>
                    </VStack>
                  }
                  text={shown}
                  change={setText}
                  disabled={disabled}
                  editText={() => setTextMode(true)}
                  renderContent={content => (
                    <Crossfade swapKey={textMode ? 'text' : 'list'} gap={pageRhythm.section}>
                      {textMode ? (
                        <VStack data-code-editor>
                          <Suspense fallback={null}>
                            <LiteCodeEditor
                              label={t.dnsEditor}
                              value={shown}
                              onChange={setText}
                              disabled={disabled}
                              kind="dns"
                              connection={connection}
                              source={base!}
                              targets={targets}
                            />
                          </Suspense>
                        </VStack>
                      ) : (
                        <>
                          {content}
                          <Divider />
                          <VStack gap={pageRhythm.section}>
                            <VStack gap={1}>
                              <Heading level={2}>{t.dnsRequest}</Heading>
                              <Text type="supporting" color="secondary">
                                {t.dnsRequestHelp}
                              </Text>
                            </VStack>
                            <RuleList
                              loading={!ready && read.loading}
                              text={shown}
                              primary={false}
                              kind="request"
                              targets={[...targets, 'asis', 'reject']}
                              disabled={disabled}
                              change={setText}
                              editText={() => setTextMode(true)}
                            />
                          </VStack>
                          <Divider />
                          <Collapsible isOpen={advanced} onOpenChange={setAdvanced} chevronPosition="start" trigger={<Text type="label">{t.advanced}</Text>}>
                            {advanced && (
                              <VStack gap={pageRhythm.section} paddingBlockStart={pageRhythm.section}>
                                <VStack gap={1}>
                                  <Heading level={2}>{t.dnsResponse}</Heading>
                                  <Text type="supporting" color="secondary">
                                    {t.dnsResponseHelp}
                                  </Text>
                                </VStack>
                                <RuleList
                                  loading={!ready && read.loading}
                                  text={shown}
                                  primary={false}
                                  kind="response"
                                  targets={['accept', 'reject', ...targets]}
                                  disabled={disabled}
                                  change={setText}
                                  editText={() => setTextMode(true)}
                                />
                              </VStack>
                            )}
                          </Collapsible>
                        </>
                      )}
                    </Crossfade>
                  )}
                />
              </VStack>
              <ReviewDialog
                open={candidate !== null}
                close={() => setCandidate(null)}
                pending={task.busy !== null}
                notice={task.notice}
                disabled={disabled}
                summary={dnsReview(original, shown, t)}
                before={base?.content ?? ''}
                after={candidate ?? base?.content ?? ''}
                confirm={() =>
                  void task.run('apply', async () => {
                    if (!candidate) return undefined;
                    try {
                      const source = await applyContent(connection, base!, candidate);
                      read.setData(source);
                      setText(null);
                      setCandidate(null);
                      return {key: 'changesSaved'};
                    } catch (error) {
                      setCandidate(null);
                      throw error;
                    }
                  })
                }
              />
            </>
          }
        </VStack>
      }
    />
  );
}
