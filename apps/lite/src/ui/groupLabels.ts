import {policyKey} from '../describe';
import type {Messages} from '../i18n/en';

export function policyLabel(keyword: string, t: Messages): string {
  return t[policyKey(keyword)];
}
