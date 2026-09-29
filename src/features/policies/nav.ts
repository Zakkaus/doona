import type {Key} from '../../i18n';

export type PolicyTab = 'groups' | 'arrange';
// The group cards come first and are the default, then the membership editor that rearranges them.
export function policiesTabs(): Array<{id: PolicyTab; titleKey: Key}> {
  return [
    {id: 'groups', titleKey: 'policy.tab.groups'},
    {id: 'arrange', titleKey: 'policy.tab.arrange'}
  ];
}
