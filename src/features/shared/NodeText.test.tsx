import {expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {NodeText} from './NodeText';

vi.mock('../../ui/NodeName', () => ({NodeName: ({name}: {name: string}) => name}));

it('keeps placeholder-like group and node names intact', () => {
  expect(
    renderToStaticMarkup(
      <NodeText
        text="{0}: {1}"
        names={[
          {name: 'team-{0}', nodeName: false},
          {name: 'jp-{1}', nodeName: true}
        ]}
      />
    )
  ).toBe('team-{0}: jp-{1}');
});
