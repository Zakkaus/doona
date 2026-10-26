import type {KeyboardEvent} from 'react';

// Astryx 0.6.8 handles arrows; Page Up/Down add ten steps without visible steppers.
export function numberPageStep(change: (value: number) => void, {min = 0, max = Number.MAX_SAFE_INTEGER, step = 1} = {}) {
  return (event: KeyboardEvent<HTMLInputElement>) => {
    if (!['PageUp', 'PageDown'].includes(event.key) || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    const current = Number(event.currentTarget.value.replaceAll(',', '').trim());
    if (!Number.isFinite(current)) return;
    event.preventDefault();
    const next = Number((current + (event.key === 'PageUp' ? 10 : -10) * step).toPrecision(15));
    change(Math.min(max, Math.max(min, next)));
  };
}
