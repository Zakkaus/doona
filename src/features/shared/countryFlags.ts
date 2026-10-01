import {regionOf} from './geo';
import {flagKey, hasEmbeddedFlag, regionFlag, type FlagOverrides} from '../../dae/flags';
import {boundedMemo} from './boundedMemo';

const lookupName = boundedMemo((name: string) => {
  const embedded = hasEmbeddedFlag(name);
  const region = embedded ? null : regionOf(name);
  return {flag: region ? regionFlag(region) : null, embedded};
});

export function flagForName(name: string): string | null {
  return lookupName(name).flag;
}

export function resolvedFlag(name: string, overrides: FlagOverrides, enabled: boolean): string | null {
  if (!enabled) return null;
  const detected = lookupName(name);
  if (detected.embedded) return null;
  const override = overrides[flagKey(name)];
  if (override === 'none') return null;
  if (override) return regionFlag(override);
  return detected.flag;
}
