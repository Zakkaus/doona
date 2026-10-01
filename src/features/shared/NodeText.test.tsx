import {expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {translate, type Translator} from '../../i18n';
import {changePresentation} from '../policies/arrange/view';
import {NodeText} from './NodeText';

vi.mock('../../ui/NodeName', () => ({NodeName: ({name}: {name: string}) => name}));
const t: Translator = (key, params) => translate('en', key, params);

it('keeps placeholder-like group and node names intact in the review sheet', () => {
  for (const kind of ['addNode', 'removeNode'] as const) {
    const presentation = changePresentation({kind, group: 'team-{0}', value: 'jp-{1}'}, [], t);
    expect(renderToStaticMarkup(<NodeText {...presentation} />)).toBe(kind === 'addNode' ? 'Add node jp-{1} to team-{0}' : 'Remove node jp-{1} from team-{0}');
  }
  const presentation = changePresentation({kind: 'addSubscription', group: 'team-{0}', value: 'sub'}, [{tag: 'sub', label: '{1}', count: 1}], t);
  expect(renderToStaticMarkup(<NodeText {...presentation} />)).toBe('Add the whole subscription {1} to team-{0}');
});
