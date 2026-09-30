// Keep the identifying column and primary value ahead of actions and optional columns on phones.
export function primaryFirst<C extends {id: string; isRowHeader?: boolean; drop?: number}>(columns: C[], id: string): C[] {
  const primary = (column: C) => column.isRowHeader || column.id === id;
  return [
    ...columns.filter(primary),
    ...columns.filter(column => !primary(column) && !column.drop),
    ...columns.filter(column => !primary(column) && column.drop)
  ];
}
