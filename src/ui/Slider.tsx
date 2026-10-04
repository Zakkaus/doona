import {Label, Slider as RSlider, SliderOutput, SliderThumb, SliderTrack} from 'react-aria-components';
import {useControlSize, type ControlSize} from './controlSize';

// S2 Slider: the label and the value on one line over a track whose start is filled up to the handle. The value is
// formatted in the page's locale, so a fraction with `formatOptions={{style: 'percent'}}` reads as a percentage.
export function Slider({
  label,
  value,
  onChange,
  onChangeEnd,
  minValue = 0,
  maxValue = 100,
  step = 1,
  formatOptions,
  size
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  minValue?: number;
  maxValue?: number;
  step?: number;
  formatOptions?: Intl.NumberFormatOptions;
  size?: ControlSize;
}) {
  const controlSize = useControlSize(size);
  return (
    <RSlider
      className="rp-range"
      data-size={controlSize}
      value={value}
      onChange={onChange}
      onChangeEnd={onChangeEnd}
      minValue={minValue}
      maxValue={maxValue}
      step={step}
      formatOptions={formatOptions}
    >
      <Label className="lbl">{label}</Label>
      <SliderOutput className="lbl" />
      <SliderTrack className="track">
        {({state}) => (
          <>
            <span className="fill" style={{inlineSize: `${state.getThumbPercent(0) * 100}%`}} />
            <SliderThumb className="thumb" />
          </>
        )}
      </SliderTrack>
    </RSlider>
  );
}
