import {pinnedProfile, profileOwner} from '../../api/profiles';
import {storageKeys} from '../../api/storage';
// Whether each group shows its members, kept per backend for the groups the reader set apart from their default: a
// manual group opens, an automatic one folds under its summary.
type Folds = Record<string, Record<string, boolean>>;
const owner = () => {
  const profile = pinnedProfile();
  return profileOwner(profile?.id ?? '', profile?.api ?? '');
};
function readFolds(): Folds {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKeys.policyFolds) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Folds) : {};
  } catch {
    return {};
  }
}
export function readFold(group: string, automatic: boolean): boolean {
  const saved = readFolds()[owner()]?.[group];
  return typeof saved === 'boolean' ? saved : !automatic;
}
export function saveFold(group: string, automatic: boolean, expanded: boolean) {
  const folds = readFolds();
  const key = owner();
  const own = {...folds[key]};
  if (expanded === !automatic) delete own[group];
  else own[group] = expanded;
  if (Object.keys(own).length) folds[key] = own;
  else delete folds[key];
  try {
    localStorage.setItem(storageKeys.policyFolds, JSON.stringify(folds));
  } catch {
    /* Retain this session's fold. */
  }
}
