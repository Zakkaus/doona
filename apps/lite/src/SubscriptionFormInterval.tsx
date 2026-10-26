import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Selector} from '@astryxdesign/core/Selector';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {parseInterval} from '../../../src/dae/subscriptions';
import {useMessages} from './i18n';
import type {Messages} from './i18n/en';
import {numberPageStep} from './ui/numberPageStep';

const presets = [0, 3600, 21600, 43200, 86400];
export function intervalSummary(seconds: number | null | undefined, t: Messages) {
  if (!seconds) return '';
  const count = seconds % 3600 === 0 ? seconds / 3600 : seconds % 60 === 0 ? seconds / 60 : seconds;
  const unit =
    seconds % 3600 === 0
      ? count === 1
        ? t.intervalHour
        : t.intervalHours
      : seconds % 60 === 0
        ? count === 1
          ? t.intervalMinute
          : t.intervalMinutes
        : count === 1
          ? t.intervalSecond
          : t.intervalSeconds;
  return t.intervalSummary.replace('{n}', String(count)).replace('{unit}', unit);
}
export function intervalValue(value: string, original: number | null) {
  return value === '' ? original : parseInterval(value);
}
export function SubscriptionFormInterval({
  value,
  original,
  change,
  disabled
}: {
  value: string;
  original: number | null;
  change: (value: string) => void;
  disabled: boolean;
}) {
  const t = useMessages();
  const seconds = intervalValue(value, original);
  const custom = value.endsWith('m') || value.endsWith('h') || (seconds !== null && !presets.includes(seconds));
  const unit = value.endsWith('m')
    ? 'm'
    : value.endsWith('h')
      ? 'h'
      : seconds !== null && seconds % 3600 === 0
        ? 'h'
        : seconds !== null && seconds % 60 === 0
          ? 'm'
          : 's';
  const count = /[mhs]$/.test(value) ? value.slice(0, -1) : seconds === null ? '' : String(seconds / {h: 3600, m: 60, s: 1}[unit]);
  const update = (amount: number) => change(`${amount}${unit}`);
  return (
    <VStack gap={4}>
      <Selector
        label={t.autoUpdate}
        value={custom ? 'custom' : String(seconds ?? 0)}
        isDisabled={disabled}
        options={[
          {value: '0', label: t.intervalNever},
          {value: '3600', label: t.intervalHourly},
          {value: '21600', label: t.intervalSixHours},
          {value: '43200', label: t.intervalTwelveHours},
          {value: '86400', label: t.intervalDaily},
          {value: 'custom', label: t.intervalCustom}
        ]}
        onChange={next => change(next === 'custom' ? `${seconds && seconds % 3600 === 0 ? seconds / 3600 : 1}h` : next)}
      />
      {custom && (
        <HStack gap={3} wrap="wrap" vAlign="end">
          <NumberInput
            label={t.intervalAmount}
            value={count === '' ? null : Number(count)}
            min={1}
            max={Math.floor(Number.MAX_SAFE_INTEGER / 3600)}
            isIntegerOnly
            isWheelEnabled={false}
            isDisabled={disabled}
            onChange={update}
            onInput={event => change(`${(event.target as HTMLInputElement).value.replaceAll(',', '')}${unit}`)}
            onKeyDown={numberPageStep(update, {min: 1, max: Math.floor(Number.MAX_SAFE_INTEGER / 3600)})}
          />
          <Selector
            label={t.intervalUnit}
            value={unit}
            isDisabled={disabled}
            options={[
              {value: 'm', label: t.intervalMinutes},
              {value: 'h', label: t.intervalHours},
              ...(unit === 's' ? [{value: 's', label: t.intervalSeconds}] : [])
            ]}
            onChange={next => change(`${count}${next}`)}
          />
        </HStack>
      )}
      <Text type="supporting" color="secondary">
        {t.intervalDraftHelp}
      </Text>
    </VStack>
  );
}
