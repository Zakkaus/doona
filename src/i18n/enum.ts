import type {Key, Translator} from './index';

// A wire enum value in words. A value from a newer backend has no label yet, so it reads as sent instead of blank.
export const enumLabel = (labels: Readonly<Record<string, Key>>, value: string, t: Translator): string =>
  Object.hasOwn(labels, value) ? t(labels[value]) : value;
