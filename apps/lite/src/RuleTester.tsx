import {Banner} from '@astryxdesign/core/Banner';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Selector} from '@astryxdesign/core/Selector';
import {Heading, Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {useCallback, useEffect, useRef, useState} from 'react';
import {ApiError} from '../../../src/api/error';
import {LiteError, type Connection} from './api';
import {describeRule, describeTarget, phraseText} from './describe';
import {useMessages} from './i18n';
import {parseRuleList} from './ruleDraft';
import {matchedRule, runRoutingTest, sourceRule, testInput, type RoutingTestResult} from './routingTest';
import {DocsLink} from './ui';
import {EditDialog} from './ui/EditDialog';
import {numberPageStep} from './ui/numberPageStep';

export function RuleTester({
  connection,
  open,
  close,
  dirty,
  shownRules,
  reveal
}: {
  connection: Connection;
  open: boolean;
  close: () => void;
  dirty: boolean;
  shownRules: string;
  reveal: (index: number) => void;
}) {
  const t = useMessages();
  const [more, setMore] = useState(false);
  const [address, setAddress] = useState('');
  const [port, setPort] = useState<number | null>(null);
  const [network, setNetwork] = useState<'tcp' | 'udp'>('tcp');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const [result, setResult] = useState<RoutingTestResult>();
  useEffect(() => {
    if (open) {
      setResult(undefined);
      setError(undefined);
    }
  }, [open]);
  const revealAfterClose = useRef<number | null>(null);
  const dialogRef = useCallback(
    (dialog: HTMLDialogElement | null) => {
      if (!dialog) return;
      const closed = () => {
        if (revealAfterClose.current !== null) {
          reveal(revealAfterClose.current);
          revealAfterClose.current = null;
        }
      };
      dialog.addEventListener('close', closed);
      return () => dialog.removeEventListener('close', closed);
    },
    [reveal]
  );
  const clear = () => {
    setResult(undefined);
    setError(undefined);
  };
  const submit = async () => {
    if (pending) return;
    setPending(true);
    clear();
    try {
      setResult(await runRoutingTest(connection, testInput(address, port, network)));
    } catch (error) {
      // An input error stands alone; a trace the backend cannot run or refused keeps its reason and links what a test needs.
      setError(
        error instanceof LiteError && error.key !== 'unsupported'
          ? error
          : new LiteError(error instanceof LiteError ? error.key : 'testFailed', error instanceof ApiError ? error.message : undefined, 'req-routing-trace')
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <EditDialog
      title={t.testRules}
      width={560}
      open={open}
      close={close}
      pending={pending}
      label={t.testRun}
      confirm={() => void submit()}
      disabled={!address.trim()}
      disabledReason={t.testEnterAddress}
      notice={error ? {error} : undefined}
      dialogRef={dialogRef}
      cancelLabel={t.close}
    >
      <TextInput
        label={t.testAddress}
        value={address}
        onChange={value => {
          setAddress(value);
          clear();
        }}
        isDisabled={pending}
        placeholder="example.com"
        onKeyDown={event => {
          if (event.key === 'Enter') void submit();
        }}
      />
      <Collapsible isOpen={more} onOpenChange={setMore} chevronPosition="start" trigger={<Text type="label">{t.testMore}</Text>}>
        <VStack gap={4} paddingBlockStart={4}>
          <NumberInput
            label={t.testPort}
            value={port}
            onChange={value => {
              setPort(value);
              clear();
            }}
            min={1}
            max={65535}
            placeholder={t.testPortDefault}
            isIntegerOnly
            isWheelEnabled={false}
            isDisabled={pending}
            onKeyDown={numberPageStep(setPort, {min: 1, max: 65535})}
          />
          <Selector
            label={t.testProtocol}
            value={network}
            options={['tcp', 'udp'].map(value => ({value, label: value.toUpperCase()}))}
            onChange={value => {
              setNetwork(value as 'tcp' | 'udp');
              clear();
            }}
            isDisabled={pending}
            width="100%"
          />
        </VStack>
      </Collapsible>
      {result && (
        <VStack gap={4} aria-live="polite" data-routing-test-result>
          {dirty && <Banner status="info" title={t.testDraftWarning} collapsible={false} />}
          {!result.traces.some(trace => trace.evaluations.length) && <Text>{t.testUnresolved}</Text>}
          {result.traces
            .flatMap(trace => trace.evaluations)
            .map((evaluation, i) => {
              const matched = evaluation.rules.find(rule => rule.result === 'matched');
              const rule = matched && matchedRule(result, matched.rule_id);
              const original = rule && sourceRule(result.source, rule);
              const parsed = rule && parseRuleList(`routing {\n${rule.expression} -> ${rule.outbound}\n}`, 'routing').rows[0];
              const row = original ?? parsed;
              const candidates = original ? parseRuleList(shownRules, 'routing').rows.filter(row => !row.fallback) : [];
              const indices = candidates.flatMap((row, index) => (row.anchor.text === original?.anchor.text ? [index] : []));
              const index = indices.length === 1 ? indices[0] : -1;
              const determinate = evaluation.decision === 'determinate' && evaluation.outbound !== null;
              return (
                <VStack key={i} gap={2}>
                  <Heading level={2}>
                    {determinate ? t.testWillUse.replace('{outbound}', phraseText(describeTarget(evaluation.outbound!), t)) : t.testIndeterminate}
                  </Heading>
                  {evaluation.dst_ip && result.traces.flatMap(trace => trace.evaluations).length > 1 && <Text color="secondary">{evaluation.dst_ip}</Text>}
                  {determinate &&
                    (rule?.kind === 'fallback' ? (
                      <Text>{t.testNoMatch}</Text>
                    ) : rule && row ? (
                      <Text>
                        {t.testMatched
                          .replace('{n}', String(Number(rule.index) + 1))
                          .replace('{rule}', phraseText(describeRule(row.conditions, row.target), t))}
                      </Text>
                    ) : (
                      <Text>{t.testRuleUnavailable}</Text>
                    ))}
                  {!determinate && (
                    <HStack gap={2} wrap="wrap" vAlign="center">
                      <Text>{t.testMissingConditions}</Text>
                      <DocsLink anchor="req-routing-trace" />
                    </HStack>
                  )}
                  {determinate && rule?.kind === 'rule' && index >= 0 && (
                    <Link
                      href="#routing"
                      onClick={event => {
                        event.preventDefault();
                        revealAfterClose.current = index;
                        close();
                      }}
                    >
                      {t.testViewRule}
                    </Link>
                  )}
                </VStack>
              );
            })}
        </VStack>
      )}
    </EditDialog>
  );
}
