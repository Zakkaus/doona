import {expect, it} from 'vitest';
import {nodeFixtures} from '../../../api/mock/fixtures';
import {translate, type Translator} from '../../../i18n';
import {applyReason, arrangeView, holds, parsePlaceable, removeReason, stage, unstage} from './view';

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
  const created = stage([], {kind: 'createGroup', filters: [], group: 'new', policy: 'fallback'});
  const filled = stage(created, {kind: 'addNode', group: 'new', value: 'jp-01'});
  expect(unstage(filled, 0)).toEqual([]);
});

it('refuses to stage a node whose name cannot be written into a filter', () => {
  expect(stage([], {kind: 'addNode', group: 'pair', value: "Bob's"})).toEqual([]);
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

it("says why a group's last filter cannot be removed, and nothing while the page is locked", () => {
  const view = arrangeView(text, [], [], nodes, t);
  const solo = view.groups.find(group => group.name === 'solo')!;
  const pair = view.groups.find(group => group.name === 'pair')!;
  expect(removeReason(solo, false)).toBe(t('arrange.lastMember'));
  expect(removeReason(solo, true)).toBeNull();
  expect(removeReason(pair, false)).toBeNull();
});

it("says why the review's Apply is disabled: the page cannot write first, then a new group without members", () => {
  expect(applyReason(null, [], t)).toBeNull();
  expect(applyReason(null, ['fresh', 'other'], t)).toBe(t('arrange.emptyNew', {group: 'fresh'}));
  expect(applyReason(t('arrange.readOnly'), ['fresh'], t)).toBe(t('arrange.readOnly'));
});

it('summarizes template membership without redundant node previews and retains live group counts while staging', () => {
  const text =
    "group { proxy { filter: group(auto) filter: !name('direct', 'block') } auto { filter: !name('direct', 'block') } gaming { filter: name(jp-01, hk-02) } }";
  const view = arrangeView(text, [{kind: 'addNode', group: 'proxy', value: 'us-01'}], [], nodes, t);
  const [proxy, auto, gaming] = view.groups;
  expect(proxy.liveNestedGroups).toEqual(['auto']);
  expect(proxy.ruleNote).toBe(t('arrange.filterNote'));
  expect(proxy.ruleNodes).toEqual([]);
  expect(auto.names).toEqual([]);
  expect(auto.ruleNodes).toEqual([]);
  expect(gaming.names.map(item => item.name)).toEqual(['jp-01', 'hk-02']);
  expect(gaming.rules).toEqual([]);
});
