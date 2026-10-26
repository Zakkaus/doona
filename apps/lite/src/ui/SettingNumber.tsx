import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Selector} from '@astryxdesign/core/Selector';
import {HStack} from '@astryxdesign/core/Stack';
import type {SettingField} from '../../../../src/dae/settings';
import {useMessages} from '../i18n';
import {numberPageStep} from './numberPageStep';
export function SettingNumber({
  field,
  value,
  label,
  disabled,
  change,
  onEditing
}: {
  field: SettingField;
  value: string;
  label: string;
  disabled: boolean;
  change: (value: string) => void;
  onEditing?: (value: boolean) => void;
}) {
  const t = useMessages();
  const parts = value.match(/^(\d+(?:\.\d+)?)(.*)$/);
  const amount = parts ? Number(parts[1]) : null;
  const unit = parts?.[2] ?? field.units?.[0] ?? '';
  return (
    <HStack gap={2} onInput={() => onEditing?.(true)}>
      <NumberInput
        label={label}
        isLabelHidden
        size="sm"
        width={192}
        value={amount}
        units={unit || undefined}
        isWheelEnabled={false}
        onInput={event => {
          if (event.target instanceof HTMLInputElement && event.target.value === '') change('');
        }}
        onBlur={() => onEditing?.(false)}
        onChange={number => change(number === null ? '' : `${number}${unit}`)}
        min={0}
        max={field.max && Number(field.max) <= Number.MAX_SAFE_INTEGER ? Number(field.max) : Number.MAX_SAFE_INTEGER}
        onKeyDown={numberPageStep(number => change(`${number}${unit}`), {
          max: field.max ? Math.min(Number(field.max), Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER,
          step: unit === 'ms' ? 100 : 1
        })}
        step={unit === 'ms' ? 100 : 1}
        isIntegerOnly={field.type === 'integer' || unit !== 's'}
        isDisabled={disabled}
        placeholder={t.defaultValue}
      />
      {field.type === 'duration' && (
        <Selector
          label={`${label}: ${t.durationUnit}`}
          isLabelHidden
          size="sm"
          value={unit}
          options={(field.units ?? ['s']).map(value => ({value, label: value || t.defaultValue}))}
          onChange={next => change(`${amount ?? 0}${next}`)}
          isDisabled={disabled}
        />
      )}
    </HStack>
  );
}
