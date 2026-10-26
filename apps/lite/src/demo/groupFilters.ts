import {compileFilters} from '../../../../src/dae/groupFilters';
export * from '../../../../src/dae/groupFilters';

// Activation reuses each parsed entry's filter array for every candidate node.
const compiled = new WeakMap<string[], ReturnType<typeof compileFilters>>();
export function groupAdmits(filters: string[], node: Parameters<ReturnType<typeof compileFilters>>[0]) {
  let predicate = compiled.get(filters);
  if (!predicate) {
    predicate = compileFilters(filters);
    compiled.set(filters, predicate);
  }
  return predicate(node);
}
