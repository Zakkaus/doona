import {policyKey} from '../describe';
import type {Messages} from '../i18n/en';

export const selectionTone = {automatic: 'success', manual: 'accent'} as const;
export function policyLabel(keyword: string, t: Messages): string {
  return t[policyKey(keyword)];
}
