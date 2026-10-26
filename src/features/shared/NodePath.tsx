import {NodeName} from '../../ui/NodeName';
import {TextTooltip} from '../../ui/ui';

export function NodePath({row}: {row: {node: string; nodeName: boolean; path: string | null}}) {
  const text = row.path ?? undefined;
  return row.nodeName ? (
    <NodeName name={row.node} className="rp-chain" text={text} />
  ) : (
    <TextTooltip className="rp-chain" text={text}>
      {row.node}
    </TextTooltip>
  );
}
