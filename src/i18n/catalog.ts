import type {Lang, Message} from './index';

const modules = import.meta.glob<Record<Lang, Record<string, Message>>>(['../features/*/messages.ts', '../shell/messages.ts', '../ui/messages.ts'], {
  eager: true,
  import: 'messages'
});
export function duplicateKeys() {
  const owners = new Set<string>();
  const duplicates: string[] = [];
  for (const module of Object.values(modules)) {
    for (const key of Object.keys(module['zh-TW'])) {
      if (owners.has(key)) duplicates.push(key);
      owners.add(key);
    }
  }
  return duplicates;
}
