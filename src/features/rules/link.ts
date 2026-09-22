import {buildHash} from '../../shell/route';

// Where a rule sits in the rule list, when the backend lists rules and the reference names one.
export const ruleHref = (ruleId: string | null, listed: boolean) =>
  listed && ruleId ? buildHash('rules', 'tab=list&rule=' + encodeURIComponent(ruleId)) : undefined;
