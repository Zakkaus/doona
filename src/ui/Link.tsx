import type {ComponentPropsWithRef} from 'react';
import {Link as RLink, composeRenderProps} from 'react-aria-components';
import {cx} from './cx';
import {useControlSize} from './controlSize';
import {buttonClass, type ButtonStyle} from './Button';

// Navigation with an address: a real link, so it can be opened in a tab or copied, in text or button dress.
// The button style applies only with `appearance="button"`.
export function Link({
  external,
  layout,
  appearance,
  label,
  className,
  quiet,
  secondary,
  small,
  icon,
  accent,
  negative,
  size,
  ...props
}: ComponentPropsWithRef<typeof RLink> &
  ButtonStyle & {
    external?: boolean;
    appearance?: 'button' | 'version' | 'link';
    layout?: 'inline' | 'constrained';
    label?: string;
  }) {
  const base = appearance === 'button' ? buttonClass({quiet, secondary, small, icon, accent, negative}) : `rp-${appearance}`;
  const controlSize = useControlSize(size);
  return (
    <RLink
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      aria-label={label}
      data-layout={layout}
      data-size={controlSize}
      {...props}
      className={appearance ? composeRenderProps(className, value => cx(base, value)) : className}
    />
  );
}
