import {conditionFamily, groupConditionKinds, newGroupCondition, type GroupConditionKind, type GroupConditionRow} from '../../dae/groupConditions';

export function conditionTerms(row: GroupConditionRow): Array<{id: number; kind: GroupConditionKind; value: string}> {
  return [row, ...(row.alternatives ?? [])].map(({id, kind, value}) => ({id, kind, value}));
}

export function changeTerm(row: GroupConditionRow, termId: number, change: {kind?: GroupConditionKind; value?: string}): GroupConditionRow {
  return termId === row.id
    ? {...row, kind: change.kind ?? row.kind, value: change.value ?? row.value}
    : {
        ...row,
        alternatives: row.alternatives!.map(term => (term.id === termId ? {...term, kind: change.kind ?? term.kind, value: change.value ?? term.value} : term))
      };
}

export function addAlternative(row: GroupConditionRow): GroupConditionRow {
  return {...row, alternatives: [...(row.alternatives ?? []), {...newGroupCondition(), kind: row.kind}]};
}

export function removeAlternative(row: GroupConditionRow, termId: number): GroupConditionRow {
  return {...row, alternatives: row.alternatives!.filter(item => item.id !== termId)};
}

export function kindChoices(row: GroupConditionRow): GroupConditionKind[] {
  return groupConditionKinds.filter(kind => kind !== 'group' && (!row.alternatives?.length || conditionFamily(kind) === conditionFamily(row.kind)));
}
