import {useEffect} from 'react';
export function dispatchCommand(command: string) {
  window.dispatchEvent(new CustomEvent('lite-command', {detail: command}));
}
export function useCommand(handle: (command: string) => void) {
  useEffect(() => {
    // A command may target a retained page while its Activity effects are paused.
    if (pendingPageCommand) handle(pendingPageCommand);
    if (pendingSearch) handle('search-target');
    const listener = (event: Event) => handle((event as CustomEvent<string>).detail);
    window.addEventListener('lite-command', listener);
    return () => window.removeEventListener('lite-command', listener);
  }, [handle]);
}
let pendingPageCommand: string | null = null;
export function requestPageCommand(command: string) {
  pendingPageCommand = command;
  dispatchCommand(command);
}
export function usePageCommand(command: string, ready: boolean, action: () => void) {
  useEffect(() => {
    const consume = () => {
      if (ready && pendingPageCommand === command) {
        pendingPageCommand = null;
        action();
      }
    };
    consume();
    window.addEventListener('lite-command', consume);
    return () => window.removeEventListener('lite-command', consume);
  }, [command, ready, action]);
}

export type SearchTarget = {
  kind: 'node' | 'group' | 'member' | 'subscription' | 'rule' | 'upstream';
  id: string;
  ruleKind?: 'routing' | 'request' | 'response';
};
let pendingSearch: SearchTarget | null = null;
export function jumpToResource(target: SearchTarget) {
  pendingSearch = target;
  location.hash =
    target.kind === 'node'
      ? 'nodes'
      : target.kind === 'group' || target.kind === 'member'
        ? 'groups'
        : target.kind === 'subscription'
          ? 'subscriptions'
          : target.ruleKind === 'routing'
            ? 'routing'
            : 'dns';
  dispatchCommand('search-target');
}
export function useSearchTarget(kind: SearchTarget['kind'], ready: boolean, action: (target: SearchTarget) => void, ruleKind?: SearchTarget['ruleKind']) {
  useEffect(() => {
    const consume = () => {
      if (ready && pendingSearch?.kind === kind && (!ruleKind || pendingSearch.ruleKind === ruleKind)) {
        const target = pendingSearch;
        pendingSearch = null;
        action(target);
      }
    };
    consume();
    window.addEventListener('lite-command', consume);
    return () => window.removeEventListener('lite-command', consume);
  }, [kind, ready, action, ruleKind]);
}

export function cancelPageCommands() {
  pendingSearch = null;
  pendingPageCommand = null;
}

export function hasPendingRuleCommand(kind: 'routing' | 'request' | 'response'): boolean {
  return (kind === 'routing' && pendingPageCommand === 'add-rule') || (pendingSearch?.kind === 'rule' && pendingSearch.ruleKind === kind);
}
