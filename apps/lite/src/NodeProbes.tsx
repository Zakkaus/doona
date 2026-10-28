import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/Stack';
import {LoadingText} from './ui/LoadingText';
import {useEffect, useMemo, useSyncExternalStore} from 'react';
import type {Node} from '../../../src/api/model';
import type {Connection} from './api';
import {useMessages} from './i18n';
import {Feedback} from './ui';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {createNodeProbes} from './nodeProbeState';

export function useNodeProbes(connection: Connection) {
  const probes = useMemo(() => createNodeProbes(connection), [connection]);
  useEffect(() => {
    probes.active = true;
    return () => {
      probes.active = false;
    };
  }, [probes]);
  return probes;
}
type NodeProbes = ReturnType<typeof useNodeProbes>;
export function useProbeUpdates(probes: NodeProbes) {
  useSyncExternalStore(probes.subscribe, probes.snapshot);
}
export function NodeLatency({node, probes, compact, loading}: {node: Node; probes: NodeProbes; compact?: boolean; loading?: boolean}) {
  const t = useMessages();
  useProbeUpdates(probes);
  const result = probes.results.get(node.id);
  const label = !probes.supports(node) ? t.probeUnsupported : result === 'timeout' ? t.probeTimeout : result === 'failed' ? t.probeFailed : null;
  return (
    <HStack gap={1} vAlign="center" hAlign="end" data-node-latency={node.id} style={compact ? {width: '10ch', flexShrink: 0} : undefined}>
      {result === 'timeout' && <StatusDot variant="error" label={t.probeTimeout} />}
      <LoadingText
        loading={loading}
        type={result === 'timeout' ? 'supporting' : undefined}
        hasTabularNumbers
        color={typeof result === 'number' ? undefined : 'secondary'}
        children={label ?? (typeof result === 'number' ? `${Math.round(result)} ms` : '—')}
      />
    </HStack>
  );
}
export function NodeProbeButton({probes, nodes, disabled}: {probes: NodeProbes; nodes: Node[]; disabled: boolean}) {
  const t = useMessages();
  useProbeUpdates(probes);
  return (
    <Button
      label={t.testLatency}
      variant="secondary"
      isLoading={probes.running !== null}
      isDisabled={disabled || !nodes.length || !probes.available || probes.running !== null}
      onClick={() => void probes.run(nodes)}
    />
  );
}
export function ProbeFeedback({probes}: {probes: NodeProbes}) {
  useProbeUpdates(probes);
  return probes.error ? <Feedback notice={{error: probes.error}} /> : null;
}
