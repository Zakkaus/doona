import {expect, it, vi} from 'vitest';
import {ApiError} from '../../../api/error';
import {newGroupCondition, type GroupConditionKind, type GroupConditionRow} from '../../../dae/groupConditions';
import {addAlternative, changeTerm, conditionTerms, kindChoices, removeAlternative} from './groupTerms';

const row: GroupConditionRow = {
  id: -1,
  kind: 'nameKeyword',
  value: 'first',
  negate: true,
  alternatives: [
    {id: -2, kind: 'nameRegex', value: '^second'},
    {id: -3, kind: 'nameExact', value: 'third'}
  ]
};

it.each([undefined, row.alternatives])('projects only term fields with alternatives %j', alternatives => {
  expect(conditionTerms({...row, alternatives})).toEqual([{id: -1, kind: 'nameKeyword', value: 'first'}, ...(alternatives ?? [])]);
});

it.each([
  {name: 'first kind', id: -1, change: {kind: 'nameExact' as const}},
  {name: 'first value', id: -1, change: {value: ''}},
  {name: 'alternative kind', id: -2, change: {kind: 'nameExact' as const}},
  {name: 'alternative value', id: -2, change: {value: ''}}
])('changes the $name without changing other terms', ({id, change}) => {
  const before = structuredClone(row);
  const next = changeTerm(row, id, change);
  expect(next).toEqual(id === row.id ? {...row, ...change} : {...row, alternatives: [{...row.alternatives![0], ...change}, row.alternatives![1]]});
  expect(row).toEqual(before);
});

it.each([
  {kind: 'nameKeyword', alternatives: undefined, expected: ['nameKeyword', 'nameRegex', 'nameExact', 'subtag', 'subtagKeyword', 'subtagRegex']},
  {kind: 'subtag', alternatives: [], expected: ['nameKeyword', 'nameRegex', 'nameExact', 'subtag', 'subtagKeyword', 'subtagRegex']},
  {kind: 'nameRegex', alternatives: row.alternatives, expected: ['nameKeyword', 'nameRegex', 'nameExact']},
  {kind: 'subtagRegex', alternatives: [{id: -2, kind: 'subtag', value: 'paid'}], expected: ['subtag', 'subtagKeyword', 'subtagRegex']}
] satisfies Array<{kind: GroupConditionKind; alternatives: GroupConditionRow['alternatives']; expected: GroupConditionKind[]}>)(
  'offers kinds for $kind with alternatives $alternatives',
  ({kind, alternatives, expected}) => {
    expect(kindChoices({...row, kind, alternatives})).toEqual(expected);
  }
);

it.each(['nameRegex', 'subtag'] as const)('adds an alternative of kind %s', kind => {
  const original = {...newGroupCondition(), kind};
  const first = addAlternative(original);
  const second = addAlternative(first);
  expect(first).toEqual({...original, alternatives: [{id: expect.any(Number), kind, value: '', negate: false}]});
  expect(second.alternatives).toEqual([...first.alternatives!, {id: expect.any(Number), kind, value: '', negate: false}]);
  expect(new Set([original.id, ...second.alternatives!.map(term => term.id)]).size).toBe(3);
  expect(original.alternatives).toBeUndefined();
});

it.each([-2, -3])('removes only alternative %s', id => {
  const next = removeAlternative(row, id);
  expect(next).toEqual({...row, alternatives: [row.alternatives![id === -2 ? 1 : 0]]});
  expect(removeAlternative(next, next.alternatives![0].id)).toEqual({...row, alternatives: []});
  expect(row.alternatives).toHaveLength(2);
});

import {hookHarness} from '../../../store/testHelpers';
import {useGroupDialog} from './useGroupDialog';
import {translate, type Translator} from '../../../i18n';
vi.mock('react', async original => ({...(await original<typeof import('react')>()), ...hookHarness.hooks}));
vi.mock('../../../store', () => ({useCapabilities: () => ({data: undefined}), useNodes: () => ({data: []}), useProviders: () => ({data: undefined})}));
const config = vi.hoisted(() => ({data: undefined as {sources: unknown[]} | undefined}));
vi.mock('../../../store/config', () => ({useConfig: () => ({data: config.data})}));
vi.mock('../../../shell/draft', () => ({useDraftGuard: () => ({clear: vi.fn()}), useDialogSession: () => ({next: vi.fn(), start: () => () => true})}));
vi.mock('../../../i18n', async original => ({
  ...(await original<typeof import('../../../i18n')>()),
  useLang: () => 'en',
  useT: () => (key: Parameters<Translator>[0], params: Parameters<Translator>[1]) => translate('en', key, params)
}));
it('asks before dismissing a new group draft and keeps it when discard is cancelled', () => {
  hookHarness.reset();
  const read = () =>
    hookHarness.render(() =>
      useGroupDialog({
        mode: 'create',
        source: {main: null, writable: true, busy: false, apply: vi.fn()},
        taken: new Set(),
        outbounds: {groups: [], nodes: [], links: new Map()},
        nodes: []
      })
    );
  read().show();
  read().name!.change('work');
  read().dismiss();
  expect(read()).toMatchObject({open: true, discard: {isOpen: true}});
  read().discard.onCancel();
  expect(read().name!.value).toBe('work');
  expect(read().discard.isOpen).toBe(false);
  read().dismiss();
  read().discard.onConfirm();
  expect(read().open).toBe(false);
  read().show();
  read().save(vi.fn());
  expect(read().name!.error).toBe('Enter a name');
});

it.each([
  [
    'a preflight that found a line',
    {
      kind: 'invalid' as const,
      diagnostics: [{level: 'error', source_id: 'src-main', line: 12, column: 5, span: null, code: 'unsupported_value', message: 'filter: bad term'}]
    }
  ],
  [
    'a write the backend refused with a line',
    {
      kind: 'failed' as const,
      error: new ApiError(422, 'validation_failed', 'Configuration validation failed', 'req-1', {
        diagnostics: [{level: 'error', source_id: 'src-main', line: 12, column: 5, span: null, code: 'unsupported_value', message: 'filter: bad term'}]
      })
    }
  ]
])('shows the refused line under the notice for %s', async (_, result) => {
  hookHarness.reset();
  config.data = {sources: [{id: 'src-main', kind: 'main', path: '/etc/dae/config.dae', content: ''}]};
  const read = () =>
    hookHarness.render(() =>
      useGroupDialog({
        mode: 'create',
        source: {main: null, writable: true, busy: false, apply: vi.fn().mockResolvedValue(result)},
        taken: new Set(),
        outbounds: {groups: [], nodes: [], links: new Map()},
        nodes: []
      })
    );
  read().show();
  read().name!.change('work');
  read().save(vi.fn());
  await vi.waitFor(() => expect(read().problem).not.toBeNull());
  expect(read().problem).toMatchObject({
    text: 'Validation found 1 error; nothing written',
    kind: 'negative',
    lines: ['config.dae line 12: Unsupported value: filter: bad term']
  });
  config.data = undefined;
});
