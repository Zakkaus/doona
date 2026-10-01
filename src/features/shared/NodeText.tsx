import {Fragment} from 'react';
import {NodeName} from '../../ui/NodeName';

export function NodeText({text, names}: {text: string; names: Array<{name: string; nodeName: boolean}>}) {
  return text.split(/(\{\d+\})/u).map((part, index) => {
    const member = /^\{\d+\}$/u.test(part) ? names[Number(part.slice(1, -1))] : undefined;
    return <Fragment key={index}>{member ? member.nodeName ? <NodeName name={member.name} /> : member.name : part}</Fragment>;
  });
}
