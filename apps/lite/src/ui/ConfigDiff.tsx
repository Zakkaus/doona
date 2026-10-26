import {VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {lineDiff} from '../../../../src/features/rules/diff';

export function ConfigDiff({before, after}: {before: string; after: string}) {
  return (
    <VStack
      as="pre"
      padding={3}
      style={{
        fontFamily: 'var(--font-family-code)',
        fontSize: 'var(--text-supporting-size)',
        whiteSpace: 'pre',
        overflowWrap: 'normal',
        overflowX: 'auto',
        borderRadius: 'var(--radius-element)',
        backgroundColor: 'var(--color-background-muted)'
      }}
    >
      {lineDiff(before, after).map((line, i) => (
        <Text
          as="span"
          key={i}
          style={{fontFamily: 'inherit', color: line.kind === 'add' ? 'var(--lite-diff-added)' : line.kind === 'del' ? 'var(--lite-diff-removed)' : undefined}}
        >
          {line.kind === 'gap' ? '…' : `${line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' '} ${line.text}`}
          {'\n'}
        </Text>
      ))}
    </VStack>
  );
}
