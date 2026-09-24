import {createElement} from 'react';
import {tokenizeDae} from './code/daeTokens';

export function DaeCode({text, as = 'span', className = ''}: {text: string; as?: 'span' | 'code' | 'pre'; className?: string}) {
  return createElement(
    as,
    {className: `rp-code ${className}`.trim()},
    tokenizeDae(text).map((token, index) => (token.type ? createElement('span', {key: index, className: `rp-dae-${token.type}`}, token.text) : token.text))
  );
}
