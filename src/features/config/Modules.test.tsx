import {expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {Modules} from './Modules';
import type {EffectiveConfig} from '../../api/model';

vi.mock('../../store', () => ({useVersion: () => ({data: undefined})}));
vi.mock('./view', () => ({
  sectionSummaries: () => [
    {
      id: 'locked',
      kind: 'experimental.native_api',
      range: 'api.dae:1-1',
      summary: '',
      note: 'Contents are incomplete or redacted',
      muted: true
    },
    {id: 'routing', kind: 'routing', range: 'rules.dae:1-1', summary: '1 rule', note: null}
  ]
}));

it('shows one muted line per card: the note when there is one, else the summary', () => {
  const markup = renderToStaticMarkup(<Modules config={{sources: []} as unknown as EffectiveConfig} />);
  expect(markup.match(/class="rp-label"/g)).toHaveLength(2);
  expect(markup).toContain('Contents are incomplete or redacted');
  expect(markup).toContain('1 rule');
  expect(markup).not.toContain('<span></span>');
});
