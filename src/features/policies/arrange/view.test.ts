import {expect, it} from 'vitest';
import {nodeFixtures} from '../../../api/mock/fixtures';
import {translate, type Translator} from '../../../i18n';
import {arrangeView, holds, parsePlaceable, stage, unstage} from './view';

const t: Translator = (key, params) => translate('en', key, params);
const {nodes} = nodeFixtures(0);
const text = `group {
    solo {
        filter: name(hk-01)
    }
    pair {
        filter: name(hk-02, sg-01)
        filter: name(keyword: 'hk')
    }
}
`;

it('stages an edit and its reverse as nothing, and drops a created group with what was staged into it', () => {
  const add = {kind: 'addNode' as const, group: 'pair', value: 'jp-01'};
  expect(stage(stage([], add), {...add, kind: 'removeNode'})).toEqual([]);
  expect(stage(stage([], add), add)).toEqual([add]);
  const created = stage([], {kind: 'createGroup', group: 'new', policy: 'fallback'});
  const filled = stage(created, {kind: 'addNode', group: 'new', value: 'jp-01'});
  expect(unstage(filled, 0)).toEqual([]);
});

it('blocks the removal that would widen a group, and warns when a rule keeps a removed node', () => {
  const view = arrangeView(text, [{kind: 'removeNode', group: 'pair', value: 'hk-02'}], [], nodes, t);
  const [solo, pair] = view.groups;
  expect(solo.names).toEqual([{name: 'hk-01', isNew: false, blocked: t('arrange.lastMember')}]);
  // hk-02 still matches keyword 'hk' on the other line, so removing its name leaves it in the group.
  expect(pair.stillIn).toEqual(['hk-02']);
  expect(pair.removedNames).toEqual(['hk-02']);
  expect(pair.ruleNodes).toEqual(expect.arrayContaining(['hk-01', 'hk-02']));
  expect(holds(pair, {kind: 'node', value: 'sg-01'})).toBe(true);
  expect(holds(pair, {kind: 'node', value: 'hk-02'})).toBe(false);
  expect(view.stagedText).toContain('filter: name(sg-01)');
});

it('accepts only a well-formed drop payload', () => {
  expect(parsePlaceable('{"kind":"node","value":"hk-01"}')).toEqual({kind: 'node', value: 'hk-01'});
  expect(parsePlaceable('{"kind":"group","value":"x"}')).toBeNull();
  expect(parsePlaceable('{"kind":"node","value":""}')).toBeNull();
  expect(parsePlaceable('not json')).toBeNull();
});
