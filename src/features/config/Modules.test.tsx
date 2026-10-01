import {expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {Modules} from './Modules';
import type {ModulesProps} from './useModules';

vi.mock('./useModules', () => ({
  useModules: () => ({
    cards: [
      {
        nodeLinks: [],
        id: 'locked',
        kind: 'experimental.native_api',
        range: 'api.dae:1-1',
        summary: '',
        note: 'Contents are incomplete or redacted',
        muted: true
      },
      {nodeLinks: [], id: 'routing', kind: 'routing', range: 'rules.dae:1-1', summary: '1 rule', note: null}
    ]
  })
}));

it('omits an empty summary on a locked card and retains populated summaries and notes', () => {
  const markup = renderToStaticMarkup(<Modules {...({} as ModulesProps)} />);
  expect(markup.match(/class="rp-light /g)).toHaveLength(2);
  expect(markup).toContain('Contents are incomplete or redacted');
  expect(markup).toContain('1 rule');
  expect(markup).not.toContain('<span></span>');
});
