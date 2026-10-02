import {expect, it} from 'vitest';
import {newGroupCondition, type GroupConditionKind, type GroupConditionRow} from '../../dae/groupConditions';
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
