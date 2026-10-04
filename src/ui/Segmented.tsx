import {useCallback, useLayoutEffect, useRef} from 'react';
import {ToggleButton, ToggleButtonGroup} from 'react-aria-components';
import {useOverflow, useSlider} from './hooks';
import {LabeledSelect} from './Picker';
import type {ControlSize} from './controlSize';

// S2 does not scroll a segmented control: one too wide for its space collapses into a picker, as S2 Tabs do. The hidden
// track keeps its box, so the switch moves nothing, and is measured to tell when the items fit again.
// S2's SegmentedControl has no size: it is M (32px), as are the default controls beside it. A page's top-level switch, on a
// page without tabs, is drawn at L like the page tabs, and so are the controls on its row. A card's size does not reach it.
export function Segmented({
  items,
  value,
  onChange,
  label,
  isDisabled,
  fill,
  size = 'M'
}: {
  items: Array<[string, string]>;
  value: string;
  onChange: (k: string) => void;
  label: string;
  isDisabled?: boolean;
  // Takes the width of its container, every segment the same share of it.
  fill?: boolean;
  size?: ControlSize;
}) {
  const [ref, pos] = useSlider(value);
  const collapsed = useOverflow(ref, items.flat().join('\n'));
  // Focus inside the control follows it across the switch, so it is neither hidden nor dropped to the page; focus
  // elsewhere stays. The picker's ref detaches before the picker leaves the page, while it can still hold focus.
  const pick = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  const pickRef = useCallback((node: HTMLDivElement) => {
    pick.current = node;
    return () => {
      refocus.current = node.contains(document.activeElement);
      pick.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    if (collapsed && ref.current?.contains(document.activeElement)) pick.current?.querySelector('button')?.focus();
    if (!collapsed && refocus.current && ref.current) {
      // The track is still hidden in the style WebKit last computed, and it refuses focus to an element it takes for
      // hidden; reading the style brings it up to date first, as Chromium's focus() does itself.
      void getComputedStyle(ref.current).visibility;
      ref.current.querySelector<HTMLElement>('[data-selected]')?.focus();
    }
    refocus.current = false;
  }, [ref, collapsed]);
  return (
    <div className="rp-segfit" data-collapsed={collapsed || undefined} data-fill={fill || undefined}>
      <ToggleButtonGroup
        ref={ref}
        className="rp-seg"
        data-size={size}
        aria-label={label}
        isDisabled={isDisabled}
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[value]}
        onSelectionChange={k => {
          const v = [...k][0];
          if (v != null) onChange(String(v));
        }}
      >
        {pos && <span className="rp-slider" data-still={pos.still || undefined} style={{left: pos.x, width: pos.w}} />}
        {items.map(([k, l]) => (
          <ToggleButton key={k} id={k} className="rp-btn" data-size={size}>
            {l}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      {collapsed && (
        <div ref={pickRef} className="rp-segpick">
          <LabeledSelect
            bare
            size={size}
            label={label}
            value={value}
            onChange={onChange}
            isDisabled={isDisabled}
            items={items.map(([id, l]) => ({id, label: l}))}
          />
        </div>
      )}
    </div>
  );
}
